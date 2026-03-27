import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface RepoFiles {
  validFixtures: string[];
  invalidFixtures: string[];
  examples: string[];
}

export function resolveRepoRoot(explicitRoot?: string): string {
  return explicitRoot ?? path.resolve(import.meta.dir, "..");
}

export function relativeRepoPath(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath) || ".";
}

export async function discoverRepoFiles(repoRoot: string): Promise<RepoFiles> {
  return {
    validFixtures: await findFiles(path.join(repoRoot, "docs", "fixtures", "valid"), ".json"),
    invalidFixtures: await findFiles(path.join(repoRoot, "docs", "fixtures", "invalid"), ".json"),
    examples: await findFiles(path.join(repoRoot, "docs", "examples"), ".md"),
  };
}

export async function expandMarkdownTargets(targetPaths: string[]): Promise<string[]> {
  const markdownFiles = new Set<string>();
  const visitedDirectories = new Set<string>();

  for (const targetPath of targetPaths) {
    await collectFilesWithExtension(path.resolve(targetPath), markdownFiles, {
      extension: ".md",
      strictRootFileExtension: true,
      visitedDirectories,
    });
  }

  return Array.from(markdownFiles).sort((left, right) => left.localeCompare(right));
}

async function findFiles(dirPath: string, extension: string): Promise<string[]> {
  const matchedFiles = new Set<string>();
  try {
    await collectFilesWithExtension(dirPath, matchedFiles, {
      extension,
      strictRootFileExtension: false,
      visitedDirectories: new Set<string>(),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return Array.from(matchedFiles).sort((left, right) => left.localeCompare(right));
}

interface CollectFilesOptions {
  extension: string;
  strictRootFileExtension: boolean;
  visitedDirectories: Set<string>;
}

async function collectFilesWithExtension(
  targetPath: string,
  matchedFiles: Set<string>,
  options: CollectFilesOptions,
): Promise<void> {
  const entry = await inspectPath(targetPath);

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

  if (entry.isSymbolicLink()) {
    const canonicalPath = await realpath(targetPath);
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
    canonicalPath: entry.isDirectory() ? await realpath(targetPath) : targetPath,
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
