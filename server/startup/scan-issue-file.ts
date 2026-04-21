import { relative, sep } from "node:path";

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

export class ScanIssueFileIdMismatchError extends Error {
  readonly expectedIssueId: string;
  readonly actualIssueId: string;
  readonly filePath: string;

  constructor(filePath: string, expectedIssueId: string, actualIssueId: string) {
    super(
      `Issue file for "${expectedIssueId}" contained mismatched frontmatter id "${actualIssueId}".`,
    );
    this.name = "ScanIssueFileIdMismatchError";
    this.filePath = filePath;
    this.expectedIssueId = expectedIssueId;
    this.actualIssueId = actualIssueId;
  }
}

function assertMatchingIssueId(
  filePath: string,
  expectedIssueId: string,
  actualIssueId: string,
): void {
  if (actualIssueId !== expectedIssueId) {
    throw new ScanIssueFileIdMismatchError(
      filePath,
      expectedIssueId,
      actualIssueId,
    );
  }
}

export interface ScanIssueFileOptions {
  rootDirectory: string;
  filePath: string;
  indexedAt: Rfc3339Timestamp;
  expectedIssueId?: string;
}

export async function scanIssueFile(
  options: ScanIssueFileOptions,
): Promise<ParsedStartupIssueFile> {
  const source = await Bun.file(options.filePath).text();
  const issue = parseIssueMarkdown(source);

  if (options.expectedIssueId !== undefined) {
    assertMatchingIssueId(
      options.filePath,
      options.expectedIssueId,
      issue.id,
    );
  }

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
