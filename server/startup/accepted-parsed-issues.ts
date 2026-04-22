import type { Rfc3339Timestamp } from "../core/types/index.ts";
import { listCanonicalIssueFiles } from "./issue-file-discovery.ts";
import { scanIssueFile, toStartupRelativeFilePath } from "./scan-issue-file.ts";
import type { ParsedStartupIssueFile } from "./startup-envelope.ts";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface StartupScanFailure {
  filePath: string;
  message: string;
}

interface DuplicateParsedIssueGroup {
  issueId: string;
  parsedIssues: ParsedStartupIssueFile[];
}

function findDuplicateParsedIssueGroups(
  parsedIssues: readonly ParsedStartupIssueFile[],
): DuplicateParsedIssueGroup[] {
  const parsedIssuesById = new Map<string, ParsedStartupIssueFile[]>();

  for (const parsedIssue of parsedIssues) {
    const existingIssues = parsedIssuesById.get(parsedIssue.issue.id) ?? [];

    existingIssues.push(parsedIssue);
    parsedIssuesById.set(parsedIssue.issue.id, existingIssues);
  }

  return Array.from(parsedIssuesById.entries())
    .filter(([, group]) => group.length > 1)
    .map(([issueId, group]) => ({
      issueId,
      parsedIssues: group,
    }))
    .sort((left, right) => left.issueId.localeCompare(right.issueId));
}

export function rejectDuplicateParsedIssueIds(
  parsedIssues: readonly ParsedStartupIssueFile[],
): {
  acceptedParsedIssues: ParsedStartupIssueFile[];
  failures: StartupScanFailure[];
} {
  const duplicateGroups = findDuplicateParsedIssueGroups(parsedIssues);

  if (duplicateGroups.length === 0) {
    return {
      acceptedParsedIssues: [...parsedIssues],
      failures: [],
    };
  }

  const duplicateFilePaths = new Set<string>();
  const failures: StartupScanFailure[] = [];

  for (const duplicateGroup of duplicateGroups) {
    const duplicatePaths = duplicateGroup.parsedIssues.map(
      (parsedIssue) => parsedIssue.source.file_path,
    );
    const message = [
      `Discovered duplicate issue id "${duplicateGroup.issueId}" in multiple files:`,
      ...duplicatePaths.map((path) => `- ${path}`),
    ].join("\n");

    for (const duplicatePath of duplicatePaths) {
      duplicateFilePaths.add(duplicatePath);
      failures.push({
        filePath: duplicatePath,
        message,
      });
    }
  }

  return {
    acceptedParsedIssues: parsedIssues.filter(
      (parsedIssue) => !duplicateFilePaths.has(parsedIssue.source.file_path),
    ),
    failures,
  };
}

export interface LoadAcceptedParsedIssuesOptions {
  rootDirectory: string;
  indexedAt: Rfc3339Timestamp;
}

export interface LoadAcceptedParsedIssuesResult {
  parsedIssues: ParsedStartupIssueFile[];
  acceptedParsedIssues: ParsedStartupIssueFile[];
  failures: StartupScanFailure[];
}

export async function loadAcceptedParsedIssues(
  options: LoadAcceptedParsedIssuesOptions,
): Promise<LoadAcceptedParsedIssuesResult> {
  const issueFilePaths = await listCanonicalIssueFiles(options.rootDirectory);
  const parsedIssues: ParsedStartupIssueFile[] = [];
  const failures: StartupScanFailure[] = [];

  for (const filePath of issueFilePaths) {
    const startupFilePath = toStartupRelativeFilePath(
      options.rootDirectory,
      filePath,
    );

    try {
      parsedIssues.push(
        await scanIssueFile({
          rootDirectory: options.rootDirectory,
          filePath,
          indexedAt: options.indexedAt,
        }),
      );
    } catch (error) {
      failures.push({
        filePath: startupFilePath,
        message: toErrorMessage(error),
      });
    }
  }

  const duplicateRejection = rejectDuplicateParsedIssueIds(parsedIssues);

  return {
    parsedIssues,
    acceptedParsedIssues: duplicateRejection.acceptedParsedIssues,
    failures: [...failures, ...duplicateRejection.failures],
  };
}
