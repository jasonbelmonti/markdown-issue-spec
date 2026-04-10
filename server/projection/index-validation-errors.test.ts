import { expect, test } from "bun:test";

import type { ValidationError } from "../core/types/index.ts";
import {
  indexValidationErrors,
  openProjectionDatabase,
  type ValidationErrorIndexTarget,
} from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

const ISSUE_FILE_PATH = "vault/issues/ISSUE-0400.md";

const BASE_TARGET: ValidationErrorIndexTarget = {
  file_path: ISSUE_FILE_PATH,
};

const BASE_ERRORS: ValidationError[] = [
  {
    code: "graph.unresolved_reference",
    severity: "error",
    message: "Issue references a target that was not found in the current graph.",
    issue_id: "ISSUE-0400",
    file_path: ISSUE_FILE_PATH,
    field_path: "links[0].target",
    related_issue_ids: ["ISSUE-0999"],
  },
  {
    code: "semantic.duplicate_state",
    severity: "warning",
    message: "Duplicate semantics remain policy-dependent.",
    file_path: ISSUE_FILE_PATH,
  },
];

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:");
}

function getValidationErrorRows(database: ProjectionDatabase) {
  return database
    .query<
      {
        file_path: string;
        position: number;
        issue_id: string | null;
        code: string;
        severity: string;
        message: string;
        field_path: string | null;
        related_issue_ids_json: string | null;
      },
      []
    >(
      `SELECT
         file_path,
         position,
         issue_id,
         code,
         severity,
         message,
         field_path,
         related_issue_ids_json
       FROM validation_errors
       ORDER BY position`,
    )
    .all();
}

test("indexValidationErrors writes deterministic validation-error rows for a file target", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexValidationErrors(database, BASE_TARGET, BASE_ERRORS);

    expect(getValidationErrorRows(database)).toEqual([
      {
        file_path: ISSUE_FILE_PATH,
        position: 0,
        issue_id: "ISSUE-0400",
        code: "graph.unresolved_reference",
        severity: "error",
        message: "Issue references a target that was not found in the current graph.",
        field_path: "links[0].target",
        related_issue_ids_json: "[\"ISSUE-0999\"]",
      },
      {
        file_path: ISSUE_FILE_PATH,
        position: 1,
        issue_id: null,
        code: "semantic.duplicate_state",
        severity: "warning",
        message: "Duplicate semantics remain policy-dependent.",
        field_path: null,
        related_issue_ids_json: null,
      },
    ]);
  } finally {
    database.close();
  }
});

test("indexValidationErrors replaces stale rows for the same file target", () => {
  const database = openMemoryProjectionDatabase();
  const updatedErrors: ValidationError[] = [
    {
      code: "graph.parent_cycle",
      severity: "error",
      message: "Parent graph contains a cycle.",
      issue_id: "ISSUE-0400",
      file_path: ISSUE_FILE_PATH,
      related_issue_ids: ["ISSUE-0401", "ISSUE-0402"],
    },
  ];

  try {
    indexValidationErrors(database, BASE_TARGET, BASE_ERRORS);
    indexValidationErrors(database, BASE_TARGET, updatedErrors);

    expect(getValidationErrorRows(database)).toEqual([
      {
        file_path: ISSUE_FILE_PATH,
        position: 0,
        issue_id: "ISSUE-0400",
        code: "graph.parent_cycle",
        severity: "error",
        message: "Parent graph contains a cycle.",
        field_path: null,
        related_issue_ids_json: "[\"ISSUE-0401\",\"ISSUE-0402\"]",
      },
    ]);
  } finally {
    database.close();
  }
});

test("indexValidationErrors rejects rows whose file path does not match the target", () => {
  const database = openMemoryProjectionDatabase();
  const mismatchedErrors: ValidationError[] = [
    {
      code: "schema.required",
      severity: "error",
      message: "Frontmatter must include title.",
      file_path: "vault/issues/ISSUE-9999.md",
    },
  ];

  try {
    expect(() => indexValidationErrors(database, BASE_TARGET, mismatchedErrors)).toThrow(
      'Validation error file path "vault/issues/ISSUE-9999.md" does not match index target "vault/issues/ISSUE-0400.md".',
    );
    expect(getValidationErrorRows(database)).toEqual([]);
  } finally {
    database.close();
  }
});
