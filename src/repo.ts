import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface RepoFiles {
  validFixtures: string[];
  invalidFixtures: string[];
  examples: string[];
}

export interface ExpandedMarkdownTargets {
  files: string[];
  unmatchedTargets: string[];
}

export function resolveRepoRoot(explicitRoot?: string): string {
  return explicitRoot ?? path.resolve(import.meta.dir, "..");
}

export function relativeRepoPath(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath) || ".";
}

export async function discoverRepoFiles(repoRoot: string): Promise<RepoFiles> {
  const canonicalRepoRoot = await realpath(repoRoot);

  return {
    validFixtures: await findFiles(
      path.join(repoRoot, "docs", "fixtures", "valid"),
      ".json",
      canonicalRepoRoot,
    ),
    invalidFixtures: await findFiles(
      path.join(repoRoot, "docs", "fixtures", "invalid"),
      ".json",
      canonicalRepoRoot,
    ),
    examples: await findFiles(path.join(repoRoot, "docs", "examples"), ".md", canonicalRepoRoot),
  };
}

export async function expandMarkdownTargets(
  targetPaths: string[],
): Promise<ExpandedMarkdownTargets> {
  const allMatchedFiles = new Set<string>();
  const unmatchedTargets: string[] = [];

  for (const targetPath of targetPaths) {
    const resolvedTargetPath = path.resolve(targetPath);
    const matchedFiles = new Set<string>();

    await collectFilesWithExtension(resolvedTargetPath, matchedFiles, {
      extension: ".md",
      strictRootFileExtension: true,
      visitedDirectories: new Set<string>(),
    });

    if (matchedFiles.size === 0) {
      unmatchedTargets.push(resolvedTargetPath);
      continue;
    }

    for (const matchedFile of matchedFiles) {
      allMatchedFiles.add(matchedFile);
    }
  }

  return {
    files: Array.from(allMatchedFiles).sort((left, right) => left.localeCompare(right)),
    unmatchedTargets,
  };
}

async function findFiles(
  dirPath: string,
  extension: string,
  repoRoot?: string,
): Promise<string[]> {
  let rootEntry;

  try {
    rootEntry = await inspectPath(dirPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  if (rootEntry.kind !== "directory") {
    return [];
  }

  const matchedFiles = new Set<string>();
  await collectFilesWithExtension(dirPath, matchedFiles, {
    allowedRoots: [rootEntry.canonicalPath, repoRoot].filter(
      (value): value is string => value !== undefined,
    ),
    extension,
    strictRootFileExtension: false,
    visitedDirectories: new Set<string>(),
  });

  return Array.from(matchedFiles).sort((left, right) => left.localeCompare(right));
}

interface CollectFilesOptions {
  allowedRoots?: string[];
  extension: string;
  strictRootFileExtension: boolean;
  visitedDirectories: Set<string>;
}

async function collectFilesWithExtension(
  targetPath: string,
  matchedFiles: Set<string>,
  options: CollectFilesOptions,
): Promise<void> {
  let entry;

  try {
    entry = await inspectPath(targetPath);
  } catch (error) {
    if (isMissingPathError(error) && !options.strictRootFileExtension) {
      return;
    }

    throw error;
  }

  if (!isWithinPathBoundaries(options.allowedRoots, entry.canonicalPath)) {
    return;
  }

  if (entry.kind === "directory") {
    if (options.visitedDirectories.has(entry.canonicalPath)) {
      return;
    }

    options.visitedDirectories.add(entry.canonicalPath);
    const entries = await readdir(targetPath, { withFileTypes: true });

    await Promise.all(
      entries.map((entry) =>
        collectFilesWithExtension(path.join(targetPath, entry.name), matchedFiles, {
          ...options,
          strictRootFileExtension: false,
        }),
      ),
    );
    return;
  }

  if (entry.kind !== "file") {
    return;
  }

  if (!hasExtension(targetPath, entry.canonicalPath, options.extension)) {
    if (!options.strictRootFileExtension) {
      return;
    }

    throw new Error(`Only ${options.extension} files are supported: ${targetPath}`);
  }

  matchedFiles.add(targetPath);
}

interface PathInspection {
  canonicalPath: string;
  kind: "directory" | "file" | "other";
}

async function inspectPath(targetPath: string): Promise<PathInspection> {
  const entry = await lstat(targetPath);
  const canonicalPath = await realpath(targetPath);

  if (entry.isSymbolicLink()) {
    const resolvedEntry = await stat(targetPath);

    return {
      canonicalPath,
      kind: resolvedEntry.isDirectory()
        ? "directory"
        : resolvedEntry.isFile()
          ? "file"
          : "other",
    };
  }

  return {
    canonicalPath,
    kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
  };
}

function hasExtension(targetPath: string, canonicalPath: string, extension: string): boolean {
  const normalizedExtension = extension.toLowerCase();
  return (
    targetPath.toLowerCase().endsWith(normalizedExtension) ||
    canonicalPath.toLowerCase().endsWith(normalizedExtension)
  );
}

function isMissingPathError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function isWithinPathBoundaries(
  boundaryRoots: string[] | undefined,
  candidatePath: string,
): boolean {
  return boundaryRoots?.every((boundaryRoot) =>
    isWithinPathBoundary(boundaryRoot, candidatePath),
  ) ?? true;
}

function isWithinPathBoundary(boundaryRoot: string, candidatePath: string): boolean {
  const relativePath = path.relative(boundaryRoot, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}
