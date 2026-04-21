import type { Database } from "bun:sqlite";

import type {
  IssueEnvelope,
  Rfc3339Timestamp,
  ValidationError,
} from "../core/types/index.ts";
import {
  validateIssueGraph,
  type GraphValidationIssue,
} from "../core/validation/index.ts";
import {
  replaceProjectionState,
} from "../projection/index.ts";
import { listCanonicalIssueFiles } from "./issue-file-discovery.ts";
import { scanIssueFile, toStartupRelativeFilePath } from "./scan-issue-file.ts";
import {
  buildStartupIssueEnvelope,
  type ParsedStartupIssueFile,
} from "./startup-envelope.ts";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface StartupScanFailure {
  filePath: string;
  message: string;
}

export interface StartupScanResult {
  issueEnvelopes: IssueEnvelope[];
  failures: StartupScanFailure[];
}

export interface ScanIssuesIntoProjectionOptions {
  database: Database;
  rootDirectory: string;
  indexedAt?: Rfc3339Timestamp;
}

function groupValidationErrorsByFilePath(
  validationErrors: readonly ValidationError[],
): Map<string, ValidationError[]> {
  const validationErrorsByFilePath = new Map<string, ValidationError[]>();

  for (const validationError of validationErrors) {
    const existingValidationErrors =
      validationErrorsByFilePath.get(validationError.file_path) ?? [];

    existingValidationErrors.push(validationError);
    validationErrorsByFilePath.set(
      validationError.file_path,
      existingValidationErrors,
    );
  }

  return validationErrorsByFilePath;
}

function buildGraphValidationIssues(
  parsedIssues: readonly ParsedStartupIssueFile[],
): GraphValidationIssue[] {
  return parsedIssues.map(({ issue, source }) => ({
    issue,
    file_path: source.file_path,
  }));
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

export async function scanIssueFilesIntoProjection(
  options: ScanIssuesIntoProjectionOptions,
): Promise<StartupScanResult> {
  const { database, rootDirectory } = options;
  const indexedAt = options.indexedAt ?? new Date().toISOString();
  const issueFilePaths = await listCanonicalIssueFiles(rootDirectory);
  const parsedIssues: ParsedStartupIssueFile[] = [];
  const failures: StartupScanFailure[] = [];

  for (const filePath of issueFilePaths) {
    const startupFilePath = toStartupRelativeFilePath(rootDirectory, filePath);
    let parsedIssue: ParsedStartupIssueFile;

    try {
      parsedIssue = await scanIssueFile({
        rootDirectory,
        filePath,
        indexedAt,
      });
    } catch (error) {
      failures.push({
        filePath: startupFilePath,
        message: toErrorMessage(error),
      });
      continue;
    }
    parsedIssues.push(parsedIssue);
  }

  const duplicateRejection = rejectDuplicateParsedIssueIds(parsedIssues);
  failures.push(...duplicateRejection.failures);

  const issuesById = new Map(
    duplicateRejection.acceptedParsedIssues.map(
      ({ issue }) => [issue.id, issue] as const,
    ),
  );
  const validationErrorsByFilePath = groupValidationErrorsByFilePath(
    validateIssueGraph(
      buildGraphValidationIssues(duplicateRejection.acceptedParsedIssues),
    ),
  );
  const issueEnvelopes = duplicateRejection.acceptedParsedIssues.map(
    (parsedIssue) =>
      buildStartupIssueEnvelope(
        parsedIssue,
        duplicateRejection.acceptedParsedIssues,
        issuesById,
      ),
  );

  replaceProjectionState(database, {
    issueEnvelopes,
    validationErrorsByFilePath,
  });

  return {
    issueEnvelopes,
    failures,
  };
}
