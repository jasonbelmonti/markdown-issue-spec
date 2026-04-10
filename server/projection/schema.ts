import type { Database } from "bun:sqlite";

export const PROJECTION_SCHEMA_VERSION = 1;
const PROJECTION_SCHEMA_VERSION_KEY = "schema_version";

export const PROJECTION_TABLE_NAMES = {
  metadata: "projection_meta",
  issues: "issues",
  labels: "issue_labels",
  assignees: "issue_assignees",
  links: "issue_links",
  validationErrors: "validation_errors",
} as const;

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
    revision TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    indexed_at TEXT NOT NULL,
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
  `CREATE INDEX IF NOT EXISTS issues_status_updated_at_idx
    ON ${PROJECTION_TABLE_NAMES.issues}(status, updated_at, issue_id)`,
  `CREATE INDEX IF NOT EXISTS issues_kind_updated_at_idx
    ON ${PROJECTION_TABLE_NAMES.issues}(kind, updated_at, issue_id)`,
  `CREATE INDEX IF NOT EXISTS issues_ready_updated_at_idx
    ON ${PROJECTION_TABLE_NAMES.issues}(ready, updated_at, issue_id)`,
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

export function applyProjectionSchema(database: Database): void {
  for (const statement of CREATE_TABLE_STATEMENTS) {
    database.exec(statement);
  }

  for (const statement of CREATE_INDEX_STATEMENTS) {
    database.exec(statement);
  }

  setProjectionSchemaVersion(database);
}
