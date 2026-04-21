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
}

export interface ParseTargetedIssueFileOptions {
  filePath: string;
  startupRelativeFilePath: string;
  indexedAt: Rfc3339Timestamp;
  expectedIssueId: string;
}

export async function parseTargetedIssueFile(
  options: ParseTargetedIssueFileOptions,
): Promise<ParsedStartupIssueFile> {
  const source = await Bun.file(options.filePath).text();
  const issue = parseIssueMarkdown(source);

  assertMatchingIssueId(
    options.filePath,
    options.expectedIssueId,
    issue.id,
  );

  return {
    issue,
    revision: computeIssueRevision(source),
    source: {
      file_path: options.startupRelativeFilePath,
      indexed_at: options.indexedAt,
    },
  };
}

export async function scanIssueFile(
  options: ScanIssueFileOptions,
): Promise<ParsedStartupIssueFile> {
  return parseTargetedIssueFile({
    filePath: options.filePath,
    startupRelativeFilePath: toStartupRelativeFilePath(
      options.rootDirectory,
      options.filePath,
    ),
    indexedAt: options.indexedAt,
    expectedIssueId: getExpectedIssueId(options.filePath),
  });
}
