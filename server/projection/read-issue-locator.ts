import type { Database } from "bun:sqlite";

import { PROJECTION_TABLE_NAMES } from "./schema.ts";

interface ProjectedIssueLocatorRow {
  file_path: string;
}

export interface ProjectionIssueLocator {
  filePath: string;
}

export function readIssueLocator(
  database: Database,
  issueId: string,
): ProjectionIssueLocator | null {
  const row = database
    .query<ProjectedIssueLocatorRow, [string]>(
      `SELECT file_path
       FROM ${PROJECTION_TABLE_NAMES.issues}
       WHERE issue_id = ?1`,
    )
    .get(issueId);

  if (row == null) {
    return null;
  }

  return {
    filePath: row.file_path,
  };
}
