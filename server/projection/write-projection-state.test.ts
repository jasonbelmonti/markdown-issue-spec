import { expect, test } from "bun:test";

import type { IssueEnvelope, ValidationError } from "../core/types/index.ts";
import { openProjectionDatabase, writeProjectionState } from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

const ISSUE_FILE_PATH = "vault/issues/ISSUE-0500.md";

const BASE_ENVELOPE: IssueEnvelope = {
  issue: {
    spec_version: "mis/0.1",
    id: "ISSUE-0500",
    title: "Compose projection writes transactionally",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-10T12:00:00-05:00",
    updated_at: "2026-04-10T12:30:00-05:00",
    labels: ["projection"],
    assignees: ["jason"],
    links: [
      {
        rel: "references",
        target: { id: "ISSUE-0001" },
      },
    ],
  },
  derived: {
    children_ids: [],
    blocks_ids: [],
    blocked_by_ids: [],
    duplicates_ids: [],
    ready: true,
    is_blocked: false,
  },
  revision: "rev-10",
  source: {
    file_path: ISSUE_FILE_PATH,
    indexed_at: "2026-04-10T12:45:00-05:00",
  },
};

const BASE_VALIDATION_ERRORS: ValidationError[] = [
  {
    code: "semantic.duplicate_state",
    severity: "warning",
    message: "Duplicate semantics remain policy-dependent.",
    issue_id: "ISSUE-0500",
    file_path: ISSUE_FILE_PATH,
  },
];

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:");
}

function countIssueRows(database: ProjectionDatabase): number {
  return (
    database
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM issues")
      .get()?.count ?? 0
  );
}

function getValidationRows(database: ProjectionDatabase) {
  return database
    .query<
      {
        file_path: string;
        issue_id: string | null;
        code: string;
        severity: string;
      },
      []
    >(
      `SELECT file_path, issue_id, code, severity
       FROM validation_errors
       ORDER BY position`,
    )
    .all();
}

test("writeProjectionState persists issue-envelope and validation rows in one call", () => {
  const database = openMemoryProjectionDatabase();

  try {
    writeProjectionState(database, {
      issueEnvelope: BASE_ENVELOPE,
      validationErrors: BASE_VALIDATION_ERRORS,
    });

    expect(countIssueRows(database)).toBe(1);
    expect(getValidationRows(database)).toEqual([
      {
        file_path: ISSUE_FILE_PATH,
        issue_id: "ISSUE-0500",
        code: "semantic.duplicate_state",
        severity: "warning",
      },
    ]);
  } finally {
    database.close();
  }
});

test("writeProjectionState rolls back issue writes when validation-error indexing fails", () => {
  const database = openMemoryProjectionDatabase();
  const mismatchedValidationErrors: ValidationError[] = [
    {
      code: "graph.parent_cycle",
      severity: "error",
      message: "Parent graph contains a cycle.",
      issue_id: "ISSUE-0500",
      file_path: "vault/issues/ISSUE-9999.md",
    },
  ];

  try {
    expect(() =>
      writeProjectionState(database, {
        issueEnvelope: BASE_ENVELOPE,
        validationErrors: mismatchedValidationErrors,
      }),
    ).toThrow(
      'Validation error file path "vault/issues/ISSUE-9999.md" does not match index target "vault/issues/ISSUE-0500.md".',
    );

    expect(countIssueRows(database)).toBe(0);
    expect(getValidationRows(database)).toEqual([]);
  } finally {
    database.close();
  }
});
