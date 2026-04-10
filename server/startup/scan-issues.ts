import type { Database } from "bun:sqlite";

import type { IssueEnvelope, Rfc3339Timestamp } from "../core/types/index.ts";
import { writeProjectionState } from "../projection/index.ts";
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

export async function scanIssueFilesIntoProjection(
  options: ScanIssuesIntoProjectionOptions,
): Promise<StartupScanResult> {
  const { database, rootDirectory } = options;
  const indexedAt = options.indexedAt ?? new Date().toISOString();
  const issueFilePaths = await listCanonicalIssueFiles(rootDirectory);
  const parsedIssues: ParsedStartupIssueFile[] = [];
  const failures: StartupScanFailure[] = [];

  for (const filePath of issueFilePaths) {
    let parsedIssue: ParsedStartupIssueFile;

    try {
      parsedIssue = await scanIssueFile({
        rootDirectory,
        filePath,
        indexedAt,
      });
    } catch (error) {
      failures.push({
        filePath: toStartupRelativeFilePath(rootDirectory, filePath),
        message: toErrorMessage(error),
      });
      continue;
    }
    parsedIssues.push(parsedIssue);
  }

  const issuesById = new Map(
    parsedIssues.map(({ issue }) => [issue.id, issue] as const),
  );
  const issueEnvelopes = parsedIssues.map((parsedIssue) =>
    buildStartupIssueEnvelope(parsedIssue, parsedIssues, issuesById),
  );

  for (const issueEnvelope of issueEnvelopes) {
    writeProjectionState(database, {
      issueEnvelope,
      validationErrors: [],
    });
  }

  return {
    issueEnvelopes,
    failures,
  };
}
