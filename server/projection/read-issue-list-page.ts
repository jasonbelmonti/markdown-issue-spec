import type { Database } from "bun:sqlite";

import type { Issue, Rfc3339Timestamp } from "../core/types/index.ts";
import {
  decodeIssueListCursor,
  encodeIssueListCursor,
} from "./issue-list-cursor.ts";
import { normalizeRfc3339SortKey } from "./rfc3339-sort-key.ts";
import { PROJECTION_TABLE_NAMES } from "./schema.ts";

type SqlParameter = string | number;

interface ProjectedIssueListRow {
  issue_id: string;
  effective_updated_at_utc_second: string;
  effective_updated_at_fractional: string;
}

export interface ListIssueEnvelopesQuery {
  status?: Issue["status"];
  kind?: Issue["kind"];
  label?: string;
  assignee?: string;
  parentId?: string;
  dependsOnId?: string;
  ready?: boolean;
  updatedAfter?: Rfc3339Timestamp;
  limit: number;
  cursor?: string;
}

export interface ProjectionIssueListPage {
  issueIds: string[];
  nextCursor: string | null;
}

const ISSUE_TABLE_ALIAS = "issues";
const EFFECTIVE_UPDATED_AT_UTC_SECOND_SQL =
  `${ISSUE_TABLE_ALIAS}.effective_updated_at_utc_second`;
const EFFECTIVE_UPDATED_AT_FRACTIONAL_SQL =
  `${ISSUE_TABLE_ALIAS}.effective_updated_at_fractional`;

function appendParameter(
  parameters: SqlParameter[],
  value: SqlParameter,
): string {
  parameters.push(value);

  return `?${parameters.length}`;
}

function buildExistsClause(
  tableName: string,
  columnName: string,
  valuePlaceholder: string,
): string {
  return `EXISTS (
    SELECT 1
    FROM ${tableName}
    WHERE ${tableName}.issue_id = ${ISSUE_TABLE_ALIAS}.issue_id
      AND ${tableName}.${columnName} = ${valuePlaceholder}
  )`;
}

function buildLinkTargetExistsClause(
  relation: string,
  targetIssueIdPlaceholder: string,
): string {
  return `EXISTS (
    SELECT 1
    FROM ${PROJECTION_TABLE_NAMES.links}
    WHERE ${PROJECTION_TABLE_NAMES.links}.issue_id = ${ISSUE_TABLE_ALIAS}.issue_id
      AND ${PROJECTION_TABLE_NAMES.links}.rel = '${relation}'
      AND ${PROJECTION_TABLE_NAMES.links}.target_issue_id = ${targetIssueIdPlaceholder}
  )`;
}

function assertPositiveIntegerLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Issue list limit must be a positive integer.");
  }
}

function appendUpdatedAfterCondition(
  conditions: string[],
  parameters: SqlParameter[],
  updatedAfter: Rfc3339Timestamp,
): void {
  const updatedAfterSortKey = normalizeRfc3339SortKey(updatedAfter);
  const utcSecondPlaceholder = appendParameter(
    parameters,
    updatedAfterSortKey.utcSecond,
  );
  const fractionalPlaceholder = appendParameter(
    parameters,
    updatedAfterSortKey.fractionalDigits,
  );

  conditions.push(
    `(
      ${EFFECTIVE_UPDATED_AT_UTC_SECOND_SQL} > ${utcSecondPlaceholder}
      OR (
        ${EFFECTIVE_UPDATED_AT_UTC_SECOND_SQL} = ${utcSecondPlaceholder}
        AND ${EFFECTIVE_UPDATED_AT_FRACTIONAL_SQL} > ${fractionalPlaceholder}
      )
    )`,
  );
}

function appendCursorCondition(
  conditions: string[],
  parameters: SqlParameter[],
  cursor: string,
): void {
  const decodedCursor = decodeIssueListCursor(cursor);
  const utcSecondPlaceholder = appendParameter(
    parameters,
    decodedCursor.utcSecond,
  );
  const fractionalPlaceholder = appendParameter(
    parameters,
    decodedCursor.fractionalDigits,
  );
  const issueIdPlaceholder = appendParameter(parameters, decodedCursor.issueId);

  conditions.push(
    `(
      ${EFFECTIVE_UPDATED_AT_UTC_SECOND_SQL} < ${utcSecondPlaceholder}
      OR (
        ${EFFECTIVE_UPDATED_AT_UTC_SECOND_SQL} = ${utcSecondPlaceholder}
        AND (
          ${EFFECTIVE_UPDATED_AT_FRACTIONAL_SQL} < ${fractionalPlaceholder}
          OR (
            ${EFFECTIVE_UPDATED_AT_FRACTIONAL_SQL} = ${fractionalPlaceholder}
            AND ${ISSUE_TABLE_ALIAS}.issue_id > ${issueIdPlaceholder}
          )
        )
      )
    )`,
  );
}

function buildIssueListQuery(query: ListIssueEnvelopesQuery): {
  sql: string;
  parameters: SqlParameter[];
} {
  const conditions: string[] = [];
  const parameters: SqlParameter[] = [];

  if (query.status !== undefined) {
    conditions.push(
      `${ISSUE_TABLE_ALIAS}.status = ${appendParameter(parameters, query.status)}`,
    );
  }

  if (query.kind !== undefined) {
    conditions.push(
      `${ISSUE_TABLE_ALIAS}.kind = ${appendParameter(parameters, query.kind)}`,
    );
  }

  if (query.label !== undefined) {
    conditions.push(
      buildExistsClause(
        PROJECTION_TABLE_NAMES.labels,
        "label",
        appendParameter(parameters, query.label),
      ),
    );
  }

  if (query.assignee !== undefined) {
    conditions.push(
      buildExistsClause(
        PROJECTION_TABLE_NAMES.assignees,
        "assignee",
        appendParameter(parameters, query.assignee),
      ),
    );
  }

  if (query.parentId !== undefined) {
    conditions.push(
      buildLinkTargetExistsClause(
        "parent",
        appendParameter(parameters, query.parentId),
      ),
    );
  }

  if (query.dependsOnId !== undefined) {
    conditions.push(
      buildLinkTargetExistsClause(
        "depends_on",
        appendParameter(parameters, query.dependsOnId),
      ),
    );
  }

  if (query.ready !== undefined) {
    conditions.push(
      `${ISSUE_TABLE_ALIAS}.ready = ${appendParameter(parameters, query.ready ? 1 : 0)}`,
    );
  }

  if (query.updatedAfter !== undefined) {
    appendUpdatedAfterCondition(conditions, parameters, query.updatedAfter);
  }

  if (query.cursor !== undefined) {
    appendCursorCondition(conditions, parameters, query.cursor);
  }

  const limitPlaceholder = appendParameter(parameters, query.limit + 1);
  const whereClause =
    conditions.length === 0 ? "" : `WHERE ${conditions.join("\n  AND ")}`;

  return {
    sql: `SELECT
      ${ISSUE_TABLE_ALIAS}.issue_id,
      ${EFFECTIVE_UPDATED_AT_UTC_SECOND_SQL} AS effective_updated_at_utc_second,
      ${EFFECTIVE_UPDATED_AT_FRACTIONAL_SQL} AS effective_updated_at_fractional
    FROM ${PROJECTION_TABLE_NAMES.issues} AS ${ISSUE_TABLE_ALIAS}
    ${whereClause}
    ORDER BY
      ${EFFECTIVE_UPDATED_AT_UTC_SECOND_SQL} DESC,
      ${EFFECTIVE_UPDATED_AT_FRACTIONAL_SQL} DESC,
      ${ISSUE_TABLE_ALIAS}.issue_id ASC
    LIMIT ${limitPlaceholder}`,
    parameters,
  };
}

function getNextCursor(
  rows: readonly ProjectedIssueListRow[],
  limit: number,
): string | null {
  if (rows.length <= limit) {
    return null;
  }

  const lastRow = rows[limit - 1];

  if (lastRow === undefined) {
    return null;
  }

  return encodeIssueListCursor({
    utcSecond: lastRow.effective_updated_at_utc_second,
    fractionalDigits: lastRow.effective_updated_at_fractional,
    issueId: lastRow.issue_id,
  });
}

function getIssueIds(rows: readonly ProjectedIssueListRow[]): string[] {
  return rows.map((row) => row.issue_id);
}

export function readIssueListPage(
  database: Database,
  query: ListIssueEnvelopesQuery,
): ProjectionIssueListPage {
  assertPositiveIntegerLimit(query.limit);

  const builtQuery = buildIssueListQuery(query);
  const rows = database
    .query<ProjectedIssueListRow, SqlParameter[]>(builtQuery.sql)
    .all(...builtQuery.parameters);
  const selectedRows = rows.slice(0, query.limit);

  return {
    issueIds: getIssueIds(selectedRows),
    nextCursor: getNextCursor(rows, query.limit),
  };
}
