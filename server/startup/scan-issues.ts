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
import {
  loadAcceptedParsedIssues,
  type StartupScanFailure,
} from "./accepted-parsed-issues.ts";
import {
  buildStartupIssueEnvelope,
  type ParsedStartupIssueFile,
} from "./startup-envelope.ts";

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

export async function scanIssueFilesIntoProjection(
  options: ScanIssuesIntoProjectionOptions,
): Promise<StartupScanResult> {
  const { database, rootDirectory } = options;
  const indexedAt = options.indexedAt ?? new Date().toISOString();
  const {
    acceptedParsedIssues,
    failures,
  } = await loadAcceptedParsedIssues({
    rootDirectory,
    indexedAt,
  });

  const issuesById = new Map(
    acceptedParsedIssues.map(
      ({ issue }) => [issue.id, issue] as const,
    ),
  );
  const validationErrorsByFilePath = groupValidationErrorsByFilePath(
    validateIssueGraph(
      buildGraphValidationIssues(acceptedParsedIssues),
    ),
  );
  const issueEnvelopes = acceptedParsedIssues.map(
    (parsedIssue) =>
      buildStartupIssueEnvelope(
        parsedIssue,
        acceptedParsedIssues,
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
