import type { Database } from "bun:sqlite";

import type { Issue, Rfc3339Timestamp } from "../core/types/index.ts";
import {
  type IssueListCursor,
  decodeIssueListCursor,
  encodeIssueListCursor,
} from "./issue-list-cursor.ts";
import {
  compareRfc3339SortKeys,
  normalizeRfc3339SortKey,
  type Rfc3339SortKey,
} from "./rfc3339-sort-key.ts";
import { PROJECTION_TABLE_NAMES } from "./schema.ts";

type SqlParameter = string | number;

interface ProjectedIssueListRow {
  issue_id: string;
  effective_updated_at: string;
}

interface ProjectionIssueListCandidate {
  issueId: string;
  sortKey: Rfc3339SortKey;
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
const EFFECTIVE_UPDATED_AT_SQL = `COALESCE(${ISSUE_TABLE_ALIAS}.updated_at, ${ISSUE_TABLE_ALIAS}.created_at)`;

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
  const whereClause =
    conditions.length === 0 ? "" : `WHERE ${conditions.join("\n  AND ")}`;

  return {
    sql: `SELECT
      ${ISSUE_TABLE_ALIAS}.issue_id,
      ${EFFECTIVE_UPDATED_AT_SQL} AS effective_updated_at
    FROM ${PROJECTION_TABLE_NAMES.issues} AS ${ISSUE_TABLE_ALIAS}
    ${whereClause}`,
    parameters,
  };
}

function compareIssueIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function compareCandidatesForPageOrder(
  left: ProjectionIssueListCandidate,
  right: ProjectionIssueListCandidate,
): number {
  const sortKeyComparison = compareRfc3339SortKeys(left.sortKey, right.sortKey);

  if (sortKeyComparison !== 0) {
    return -sortKeyComparison;
  }

  return compareIssueIds(left.issueId, right.issueId);
}

function isCandidateAfterCursor(
  candidate: ProjectionIssueListCandidate,
  cursor: IssueListCursor,
): boolean {
  const sortKeyComparison = compareRfc3339SortKeys(candidate.sortKey, {
    utcSecond: cursor.utcSecond,
    fractionalDigits: cursor.fractionalDigits,
  });

  if (sortKeyComparison !== 0) {
    return sortKeyComparison < 0;
  }

  return compareIssueIds(candidate.issueId, cursor.issueId) > 0;
}

function buildCandidate(
  row: ProjectedIssueListRow,
): ProjectionIssueListCandidate {
  return {
    issueId: row.issue_id,
    sortKey: normalizeRfc3339SortKey(row.effective_updated_at),
  };
}

function applyUpdatedAfterFilter(
  candidates: readonly ProjectionIssueListCandidate[],
  updatedAfter: Rfc3339Timestamp | undefined,
): ProjectionIssueListCandidate[] {
  if (updatedAfter === undefined) {
    return [...candidates];
  }

  const updatedAfterSortKey = normalizeRfc3339SortKey(updatedAfter);

  return candidates.filter(
    (candidate) =>
      compareRfc3339SortKeys(candidate.sortKey, updatedAfterSortKey) > 0,
  );
}

function applyCursorFilter(
  candidates: readonly ProjectionIssueListCandidate[],
  cursor: string | undefined,
): ProjectionIssueListCandidate[] {
  if (cursor === undefined) {
    return [...candidates];
  }

  const decodedCursor = decodeIssueListCursor(cursor);

  return candidates.filter((candidate) =>
    isCandidateAfterCursor(candidate, decodedCursor),
  );
}

function getNextCursor(
  candidates: readonly ProjectionIssueListCandidate[],
  limit: number,
): string | null {
  if (candidates.length <= limit) {
    return null;
  }

  const lastCandidate = candidates[limit - 1];

  if (lastCandidate === undefined) {
    return null;
  }

  return encodeIssueListCursor({
    utcSecond: lastCandidate.sortKey.utcSecond,
    fractionalDigits: lastCandidate.sortKey.fractionalDigits,
    issueId: lastCandidate.issueId,
  });
}

function getIssueIds(
  candidates: readonly ProjectionIssueListCandidate[],
): string[] {
  return candidates.map((candidate) => candidate.issueId);
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
  const candidates = applyCursorFilter(
    applyUpdatedAfterFilter(rows.map(buildCandidate), query.updatedAfter),
    query.cursor,
  ).sort(compareCandidatesForPageOrder);
  const selectedCandidates = candidates.slice(0, query.limit);

  return {
    issueIds: getIssueIds(selectedCandidates),
    nextCursor: getNextCursor(candidates, query.limit),
  };
}
