import type { Database } from "bun:sqlite";

import { normalizeRfc3339SortKey } from "./rfc3339-sort-key.ts";

export const PROJECTION_SCHEMA_VERSION = 4;
const PROJECTION_SCHEMA_VERSION_KEY = "schema_version";

export const PROJECTION_TABLE_NAMES = {
  metadata: "projection_meta",
  issues: "issues",
  labels: "issue_labels",
  assignees: "issue_assignees",
  links: "issue_links",
  validationErrors: "validation_errors",
} as const;

const ISSUE_PRESENCE_COLUMNS = [
  "has_labels",
  "has_assignees",
  "has_links",
] as const;
const ISSUE_SORT_KEY_COLUMNS = [
  "effective_updated_at_utc_second",
  "effective_updated_at_fractional",
] as const;

type IssuePresenceColumn = (typeof ISSUE_PRESENCE_COLUMNS)[number];
type IssueSortKeyColumn = (typeof ISSUE_SORT_KEY_COLUMNS)[number];

interface IssueSortKeyBackfillRow {
  issue_id: string;
  created_at: string;
  updated_at: string | null;
}

function getIssuePresenceColumnDefinition(columnName: IssuePresenceColumn): string {
  return `${columnName} INTEGER NOT NULL CHECK (${columnName} IN (0, 1)) DEFAULT 0`;
}

function getIssueSortKeyColumnDefinition(columnName: IssueSortKeyColumn): string {
  return `${columnName} TEXT NOT NULL DEFAULT ''`;
}

const ISSUE_PRESENCE_COLUMN_SQL = ISSUE_PRESENCE_COLUMNS
  .map((columnName) => getIssuePresenceColumnDefinition(columnName))
  .join(",\n    ");
const ISSUE_SORT_KEY_COLUMN_SQL = ISSUE_SORT_KEY_COLUMNS
  .map((columnName) => getIssueSortKeyColumnDefinition(columnName))
  .join(",\n    ");

const CREATE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ${PROJECTION_TABLE_NAMES.metadata} (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${PROJECTION_TABLE_NAMES.issues} (
    issue_id TEXT PRIMARY KEY,
    spec_version TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('proposed', 'accepted', 'in_progress', 'completed', 'canceled')
    ),
    resolution TEXT CHECK (
      resolution IS NULL
      OR resolution IN ('done', 'duplicate', 'obsolete', 'wont_do', 'superseded')
    ),
    summary TEXT,
    body TEXT,
    priority TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    ${ISSUE_SORT_KEY_COLUMN_SQL},
    revision TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    indexed_at TEXT NOT NULL,
    ${ISSUE_PRESENCE_COLUMN_SQL},
    ready INTEGER NOT NULL CHECK (ready IN (0, 1)),
    is_blocked INTEGER NOT NULL CHECK (is_blocked IN (0, 1)),
    extensions_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ${PROJECTION_TABLE_NAMES.labels} (
    issue_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (issue_id, position),
    FOREIGN KEY (issue_id)
      REFERENCES ${PROJECTION_TABLE_NAMES.issues}(issue_id)
      ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ${PROJECTION_TABLE_NAMES.assignees} (
    issue_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    assignee TEXT NOT NULL,
    PRIMARY KEY (issue_id, position),
    FOREIGN KEY (issue_id)
      REFERENCES ${PROJECTION_TABLE_NAMES.issues}(issue_id)
      ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ${PROJECTION_TABLE_NAMES.links} (
    issue_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    rel TEXT NOT NULL,
    target_issue_id TEXT NOT NULL,
    target_href TEXT,
    target_path TEXT,
    target_title TEXT,
    note TEXT,
    required_before TEXT CHECK (
      required_before IS NULL
      OR required_before IN ('in_progress', 'completed')
    ),
    extensions_json TEXT,
    PRIMARY KEY (issue_id, position),
    FOREIGN KEY (issue_id)
      REFERENCES ${PROJECTION_TABLE_NAMES.issues}(issue_id)
      ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ${PROJECTION_TABLE_NAMES.validationErrors} (
    file_path TEXT NOT NULL,
    position INTEGER NOT NULL,
    issue_id TEXT,
    code TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('error', 'warning')),
    message TEXT NOT NULL,
    field_path TEXT,
    related_issue_ids_json TEXT,
    PRIMARY KEY (file_path, position)
  )`,
] as const;

const CREATE_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS issues_effective_updated_at_sort_idx
    ON ${PROJECTION_TABLE_NAMES.issues}(
      effective_updated_at_utc_second DESC,
      effective_updated_at_fractional DESC,
      issue_id ASC
    )`,
  `CREATE INDEX IF NOT EXISTS issues_status_effective_updated_at_sort_idx
    ON ${PROJECTION_TABLE_NAMES.issues}(
      status,
      effective_updated_at_utc_second DESC,
      effective_updated_at_fractional DESC,
      issue_id ASC
    )`,
  `CREATE INDEX IF NOT EXISTS issues_kind_effective_updated_at_sort_idx
    ON ${PROJECTION_TABLE_NAMES.issues}(
      kind,
      effective_updated_at_utc_second DESC,
      effective_updated_at_fractional DESC,
      issue_id ASC
    )`,
  `CREATE INDEX IF NOT EXISTS issues_ready_effective_updated_at_sort_idx
    ON ${PROJECTION_TABLE_NAMES.issues}(
      ready,
      effective_updated_at_utc_second DESC,
      effective_updated_at_fractional DESC,
      issue_id ASC
    )`,
  `CREATE INDEX IF NOT EXISTS labels_label_issue_id_idx
    ON ${PROJECTION_TABLE_NAMES.labels}(label, issue_id)`,
  `CREATE INDEX IF NOT EXISTS assignees_assignee_issue_id_idx
    ON ${PROJECTION_TABLE_NAMES.assignees}(assignee, issue_id)`,
  `CREATE INDEX IF NOT EXISTS links_rel_target_issue_id_idx
    ON ${PROJECTION_TABLE_NAMES.links}(rel, target_issue_id, issue_id)`,
  `CREATE INDEX IF NOT EXISTS validation_errors_issue_id_idx
    ON ${PROJECTION_TABLE_NAMES.validationErrors}(issue_id, position)`,
  `CREATE INDEX IF NOT EXISTS validation_errors_severity_code_idx
    ON ${PROJECTION_TABLE_NAMES.validationErrors}(severity, code, position)`,
] as const;

function setProjectionSchemaVersion(database: Database): void {
  database
    .query(
      `INSERT INTO ${PROJECTION_TABLE_NAMES.metadata} (key, value)
       VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(PROJECTION_SCHEMA_VERSION_KEY, String(PROJECTION_SCHEMA_VERSION));
}

function getProjectionSchemaVersion(database: Database): number | null {
  const row = database
    .query<{ value: string }, [string]>(
      `SELECT value
       FROM ${PROJECTION_TABLE_NAMES.metadata}
       WHERE key = ?1`,
    )
    .get(PROJECTION_SCHEMA_VERSION_KEY);

  if (row === null || row === undefined) {
    return null;
  }

  const parsedVersion = Number.parseInt(row.value, 10);

  return Number.isInteger(parsedVersion) ? parsedVersion : null;
}

function listIssuesTableColumns(database: Database): Set<string> {
  return new Set(
    database
      .query<{ name: string }, []>(
        `PRAGMA table_info(${PROJECTION_TABLE_NAMES.issues})`,
      )
      .all()
      .map((column: { name: string }) => column.name),
  );
}

function ensureIssuePresenceColumns(database: Database): void {
  const existingColumns = listIssuesTableColumns(database);

  for (const columnName of ISSUE_PRESENCE_COLUMNS) {
    if (existingColumns.has(columnName)) {
      continue;
    }

    database.exec(
      `ALTER TABLE ${PROJECTION_TABLE_NAMES.issues}
       ADD COLUMN ${getIssuePresenceColumnDefinition(columnName)}`,
    );
  }
}

function ensureIssueSortKeyColumns(database: Database): boolean {
  const existingColumns = listIssuesTableColumns(database);
  let addedColumn = false;

  for (const columnName of ISSUE_SORT_KEY_COLUMNS) {
    if (existingColumns.has(columnName)) {
      continue;
    }

    database.exec(
      `ALTER TABLE ${PROJECTION_TABLE_NAMES.issues}
       ADD COLUMN ${getIssueSortKeyColumnDefinition(columnName)}`,
    );
    addedColumn = true;
  }

  return addedColumn;
}

function backfillIssueSortKeyColumns(
  database: Database,
  forceRefresh = false,
): void {
  const rows = database
    .query<IssueSortKeyBackfillRow, []>(
      `SELECT issue_id, created_at, updated_at
       FROM ${PROJECTION_TABLE_NAMES.issues}
       ${forceRefresh ? "" : "WHERE effective_updated_at_utc_second = ''"}`,
    )
    .all();

  if (rows.length === 0) {
    return;
  }

  const updateSortKeys = database.query(
    `UPDATE ${PROJECTION_TABLE_NAMES.issues}
     SET effective_updated_at_utc_second = ?2,
         effective_updated_at_fractional = ?3
     WHERE issue_id = ?1`,
  );

  for (const row of rows) {
    const sortKey = normalizeRfc3339SortKey(row.updated_at ?? row.created_at);

    updateSortKeys.run(
      row.issue_id,
      sortKey.utcSecond,
      sortKey.fractionalDigits,
    );
  }
}

export function applyProjectionSchema(database: Database): void {
  for (const statement of CREATE_TABLE_STATEMENTS) {
    database.exec(statement);
  }

  const previousSchemaVersion = getProjectionSchemaVersion(database);
  const addedSortKeyColumns = ensureIssueSortKeyColumns(database);
  ensureIssuePresenceColumns(database);
  backfillIssueSortKeyColumns(
    database,
    addedSortKeyColumns
      || previousSchemaVersion === null
      || previousSchemaVersion < PROJECTION_SCHEMA_VERSION,
  );

  for (const statement of CREATE_INDEX_STATEMENTS) {
    database.exec(statement);
  }

  setProjectionSchemaVersion(database);
}
