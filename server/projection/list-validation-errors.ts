import type { Database } from "bun:sqlite";

import type { ValidationError } from "../core/types/index.ts";
import { deserializeProjectionJson } from "./json.ts";
import { PROJECTION_TABLE_NAMES } from "./schema.ts";

interface ProjectedValidationErrorRow {
  file_path: string;
  position: number;
  issue_id: string | null;
  code: string;
  severity: ValidationError["severity"];
  message: string;
  field_path: string | null;
  related_issue_ids_json: string | null;
}

export interface ListValidationErrorsQuery {
  issue_id?: string;
  severity?: ValidationError["severity"];
  code?: ValidationError["code"];
}

function appendParameter(parameters: string[], value: string): string {
  parameters.push(value);

  return `?${parameters.length}`;
}

function buildValidationErrorListQuery(query: ListValidationErrorsQuery): {
  sql: string;
  parameters: string[];
} {
  const conditions: string[] = [];
  const parameters: string[] = [];

  if (query.issue_id !== undefined) {
    conditions.push(`issue_id = ${appendParameter(parameters, query.issue_id)}`);
  }

  if (query.severity !== undefined) {
    conditions.push(`severity = ${appendParameter(parameters, query.severity)}`);
  }

  if (query.code !== undefined) {
    conditions.push(`code = ${appendParameter(parameters, query.code)}`);
  }

  const whereClause =
    conditions.length === 0 ? "" : `WHERE ${conditions.join("\n  AND ")}`;

  return {
    sql: `SELECT
      file_path,
      position,
      issue_id,
      code,
      severity,
      message,
      field_path,
      related_issue_ids_json
    FROM ${PROJECTION_TABLE_NAMES.validationErrors}
    ${whereClause}
    ORDER BY file_path ASC, position ASC`,
    parameters,
  };
}

function hydrateValidationError(
  row: ProjectedValidationErrorRow,
): ValidationError {
  const relatedIssueIds = deserializeProjectionJson<string[]>(
    row.related_issue_ids_json,
  );

  return {
    code: row.code,
    severity: row.severity,
    message: row.message,
    file_path: row.file_path,
    ...(row.issue_id == null ? {} : { issue_id: row.issue_id }),
    ...(row.field_path == null ? {} : { field_path: row.field_path }),
    ...(relatedIssueIds == null ? {} : { related_issue_ids: relatedIssueIds }),
  };
}

export function listValidationErrors(
  database: Database,
  query: ListValidationErrorsQuery = {},
): ValidationError[] {
  const { sql, parameters } = buildValidationErrorListQuery(query);

  return database
    .query<ProjectedValidationErrorRow, string[]>(sql)
    .all(...parameters)
    .map((row: ProjectedValidationErrorRow) => hydrateValidationError(row));
}
