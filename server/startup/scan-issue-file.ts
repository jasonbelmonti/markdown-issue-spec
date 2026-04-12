import { basename, relative, sep } from "node:path";

import { parseIssueMarkdown } from "../core/parser/index.ts";
import type { Rfc3339Timestamp } from "../core/types/index.ts";
import { computeIssueRevision } from "../store/issue-revision.ts";
import type { ParsedStartupIssueFile } from "./startup-envelope.ts";

export function toStartupRelativeFilePath(
  rootDirectory: string,
  filePath: string,
): string {
  return relative(rootDirectory, filePath).split(sep).join("/");
}

function getExpectedIssueId(filePath: string): string {
  return basename(filePath, ".md");
}

function assertMatchingIssueId(filePath: string, actualIssueId: string): void {
  const expectedIssueId = getExpectedIssueId(filePath);

  if (actualIssueId !== expectedIssueId) {
    throw new Error(
      `Issue file for "${expectedIssueId}" contained mismatched frontmatter id "${actualIssueId}".`,
    );
  }
}

export interface ScanIssueFileOptions {
  rootDirectory: string;
  filePath: string;
  indexedAt: Rfc3339Timestamp;
}

export async function scanIssueFile(
  options: ScanIssueFileOptions,
): Promise<ParsedStartupIssueFile> {
  const source = await Bun.file(options.filePath).text();
  const issue = parseIssueMarkdown(source);

  assertMatchingIssueId(options.filePath, issue.id);

  return {
    issue,
    revision: computeIssueRevision(source),
    source: {
      file_path: toStartupRelativeFilePath(
        options.rootDirectory,
        options.filePath,
      ),
      indexed_at: options.indexedAt,
    },
  };
}
