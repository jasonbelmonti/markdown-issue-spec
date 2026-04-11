import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { getIssueDirectoryPath } from "../store/index.ts";

function isMissingDirectoryError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isMarkdownIssueFile(fileName: string): boolean {
  return fileName.endsWith(".md");
}

export async function listCanonicalIssueFiles(
  rootDirectory: string,
): Promise<string[]> {
  const issueDirectoryPath = getIssueDirectoryPath(rootDirectory);

  try {
    const entries = await readdir(issueDirectoryPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && isMarkdownIssueFile(entry.name))
      .map((entry) => join(issueDirectoryPath, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      return [];
    }

    throw error;
  }
}
