import { expect, test } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyProjectionSchema,
  openProjectionDatabase,
  PROJECTION_SCHEMA_VERSION,
  PROJECTION_TABLE_NAMES,
} from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

const EXPECTED_SCHEMA_OBJECTS: Array<{ name: string; type: string }> = [
  { name: "assignees_assignee_issue_id_idx", type: "index" },
  { name: "issues_kind_updated_at_idx", type: "index" },
  { name: "issues_ready_updated_at_idx", type: "index" },
  { name: "issues_status_updated_at_idx", type: "index" },
  { name: "labels_label_issue_id_idx", type: "index" },
  { name: "links_rel_target_issue_id_idx", type: "index" },
  { name: "validation_errors_issue_id_idx", type: "index" },
  { name: "validation_errors_severity_code_idx", type: "index" },
  { name: PROJECTION_TABLE_NAMES.assignees, type: "table" },
  { name: PROJECTION_TABLE_NAMES.labels, type: "table" },
  { name: PROJECTION_TABLE_NAMES.links, type: "table" },
  { name: PROJECTION_TABLE_NAMES.issues, type: "table" },
  { name: PROJECTION_TABLE_NAMES.metadata, type: "table" },
  { name: PROJECTION_TABLE_NAMES.validationErrors, type: "table" },
];

const EXPECTED_TABLE_ROWS: Array<{ name: string }> = [
  { name: PROJECTION_TABLE_NAMES.assignees },
  { name: PROJECTION_TABLE_NAMES.labels },
  { name: PROJECTION_TABLE_NAMES.links },
  { name: PROJECTION_TABLE_NAMES.issues },
  { name: PROJECTION_TABLE_NAMES.metadata },
  { name: PROJECTION_TABLE_NAMES.validationErrors },
];

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:", { applySchema: false });
}

function listSchemaObjects(database: ProjectionDatabase) {
  return database
    .query<
      {
        name: string;
        type: string;
      },
      []
    >(
      `SELECT name, type
       FROM sqlite_master
       WHERE type IN ('table', 'index')
         AND name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all();
}

function listProjectionTables(database: ProjectionDatabase) {
  return database
    .query<{ name: string }, []>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN (
           '${PROJECTION_TABLE_NAMES.assignees}',
           '${PROJECTION_TABLE_NAMES.issues}',
           '${PROJECTION_TABLE_NAMES.labels}',
           '${PROJECTION_TABLE_NAMES.links}',
           '${PROJECTION_TABLE_NAMES.metadata}',
           '${PROJECTION_TABLE_NAMES.validationErrors}'
         )
       ORDER BY name`,
    )
    .all();
}

test("applyProjectionSchema creates the projection tables and indexes for the MVP query shape", () => {
  const database = openMemoryProjectionDatabase();

  try {
    applyProjectionSchema(database);

    expect(listSchemaObjects(database)).toEqual(EXPECTED_SCHEMA_OBJECTS);
  } finally {
    database.close();
  }
});

test("applyProjectionSchema is idempotent and pins the schema version metadata", () => {
  const database = openMemoryProjectionDatabase();

  try {
    applyProjectionSchema(database);
    applyProjectionSchema(database);

    const schemaVersion = database
      .query<{ value: string }, []>(
        `SELECT value
         FROM ${PROJECTION_TABLE_NAMES.metadata}
         WHERE key = 'schema_version'`,
      )
      .get();

    expect(schemaVersion).toEqual({
      value: String(PROJECTION_SCHEMA_VERSION),
    });

    const metadataRows = database
      .query<{ count: number }, []>(
        `SELECT COUNT(*) AS count
         FROM ${PROJECTION_TABLE_NAMES.metadata}`,
      )
      .get();

    expect(metadataRows).toEqual({ count: 1 });
  } finally {
    database.close();
  }
});

test("openProjectionDatabase creates parent directories, enables foreign keys, and bootstraps the schema", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "markdown-issue-projection-"));
  const databasePath = join(rootDirectory, ".mis", "index.sqlite");
  const database = openProjectionDatabase(databasePath);

  try {
    await expect(stat(join(rootDirectory, ".mis"))).resolves.toBeDefined();

    const foreignKeys = database
      .query<{ foreign_keys: number }, []>("PRAGMA foreign_keys")
      .get();

    expect(foreignKeys).toEqual({ foreign_keys: 1 });

    expect(listProjectionTables(database)).toEqual(EXPECTED_TABLE_ROWS);
  } finally {
    database.close();
  }
});
