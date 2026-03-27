import { readdir, stat } from "node:fs/promises";
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
    validFixtures: await listFiles(path.join(repoRoot, "docs", "fixtures", "valid"), ".json"),
    invalidFixtures: await listFiles(path.join(repoRoot, "docs", "fixtures", "invalid"), ".json"),
    examples: await listFiles(path.join(repoRoot, "docs", "examples"), ".md"),
  };
}

export async function expandMarkdownTargets(targetPaths: string[]): Promise<string[]> {
  const markdownFiles = new Set<string>();

  for (const targetPath of targetPaths) {
    await collectMarkdownFiles(path.resolve(targetPath), markdownFiles, {
      skipNonMarkdownFiles: false,
    });
  }

  return Array.from(markdownFiles).sort((left, right) => left.localeCompare(right));
}

async function listFiles(dirPath: string, extension: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

interface CollectMarkdownOptions {
  skipNonMarkdownFiles: boolean;
}

async function collectMarkdownFiles(
  targetPath: string,
  markdownFiles: Set<string>,
  options: CollectMarkdownOptions,
): Promise<void> {
  const targetStat = await stat(targetPath);

  if (targetStat.isDirectory()) {
    const entries = await readdir(targetPath, { withFileTypes: true });

    await Promise.all(
      entries.map((entry) =>
        collectMarkdownFiles(path.join(targetPath, entry.name), markdownFiles, {
          skipNonMarkdownFiles: true,
        }),
      ),
    );
    return;
  }

  if (!targetStat.isFile()) {
    return;
  }

  if (!targetPath.endsWith(".md")) {
    if (options.skipNonMarkdownFiles) {
      return;
    }

    throw new Error(`Only Markdown files are supported: ${targetPath}`);
  }

  markdownFiles.add(targetPath);
}
