import { expect, test } from "bun:test";

import type { ValidationError } from "../core/types/index.ts";
import {
  indexValidationErrors,
  listValidationErrors,
  openProjectionDatabase,
  type ValidationErrorIndexTarget,
} from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

const ISSUE_1000_FILE_PATH = "vault/issues/ISSUE-1000.md";
const ISSUE_1001_FILE_PATH = "vault/issues/ISSUE-1001.md";

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:");
}

function indexErrorsForFile(
  database: ProjectionDatabase,
  filePath: string,
  errors: ValidationError[],
): void {
  const target: ValidationErrorIndexTarget = {
    file_path: filePath,
  };

  indexValidationErrors(database, target, errors);
}

function seedValidationErrors(database: ProjectionDatabase): void {
  indexErrorsForFile(database, ISSUE_1001_FILE_PATH, [
    {
      code: "semantic.duplicate_state",
      severity: "warning",
      message: "Duplicate state remains policy-dependent.",
      issue_id: "ISSUE-1001",
      file_path: ISSUE_1001_FILE_PATH,
      field_path: "status",
      related_issue_ids: ["ISSUE-2000"],
    },
    {
      code: "schema.required",
      severity: "error",
      message: "Title is required.",
      file_path: ISSUE_1001_FILE_PATH,
      related_issue_ids: [],
    },
  ]);

  indexErrorsForFile(database, ISSUE_1000_FILE_PATH, [
    {
      code: "graph.unresolved_reference",
      severity: "error",
      message: "Referenced issue was not found in the current graph.",
      issue_id: "ISSUE-1000",
      file_path: ISSUE_1000_FILE_PATH,
      field_path: "links[0].target",
      related_issue_ids: ["ISSUE-0999"],
    },
    {
      code: "schema.required",
      severity: "error",
      message: "Spec version is required.",
      issue_id: "ISSUE-1000",
      file_path: ISSUE_1000_FILE_PATH,
    },
  ]);
}

test("listValidationErrors returns projected rows ordered by file path then position", () => {
  const database = openMemoryProjectionDatabase();

  try {
    seedValidationErrors(database);

    expect(listValidationErrors(database)).toEqual([
      {
        code: "graph.unresolved_reference",
        severity: "error",
        message: "Referenced issue was not found in the current graph.",
        issue_id: "ISSUE-1000",
        file_path: ISSUE_1000_FILE_PATH,
        field_path: "links[0].target",
        related_issue_ids: ["ISSUE-0999"],
      },
      {
        code: "schema.required",
        severity: "error",
        message: "Spec version is required.",
        issue_id: "ISSUE-1000",
        file_path: ISSUE_1000_FILE_PATH,
      },
      {
        code: "semantic.duplicate_state",
        severity: "warning",
        message: "Duplicate state remains policy-dependent.",
        issue_id: "ISSUE-1001",
        file_path: ISSUE_1001_FILE_PATH,
        field_path: "status",
        related_issue_ids: ["ISSUE-2000"],
      },
      {
        code: "schema.required",
        severity: "error",
        message: "Title is required.",
        file_path: ISSUE_1001_FILE_PATH,
        related_issue_ids: [],
      },
    ]);
  } finally {
    database.close();
  }
});

test("listValidationErrors filters by issue_id with exact equality", () => {
  const database = openMemoryProjectionDatabase();

  try {
    seedValidationErrors(database);

    expect(listValidationErrors(database, { issue_id: "ISSUE-1000" })).toEqual([
      {
        code: "graph.unresolved_reference",
        severity: "error",
        message: "Referenced issue was not found in the current graph.",
        issue_id: "ISSUE-1000",
        file_path: ISSUE_1000_FILE_PATH,
        field_path: "links[0].target",
        related_issue_ids: ["ISSUE-0999"],
      },
      {
        code: "schema.required",
        severity: "error",
        message: "Spec version is required.",
        issue_id: "ISSUE-1000",
        file_path: ISSUE_1000_FILE_PATH,
      },
    ]);
  } finally {
    database.close();
  }
});

test("listValidationErrors filters by severity with exact equality", () => {
  const database = openMemoryProjectionDatabase();

  try {
    seedValidationErrors(database);

    expect(listValidationErrors(database, { severity: "warning" })).toEqual([
      {
        code: "semantic.duplicate_state",
        severity: "warning",
        message: "Duplicate state remains policy-dependent.",
        issue_id: "ISSUE-1001",
        file_path: ISSUE_1001_FILE_PATH,
        field_path: "status",
        related_issue_ids: ["ISSUE-2000"],
      },
    ]);
  } finally {
    database.close();
  }
});

test("listValidationErrors filters by code with exact equality", () => {
  const database = openMemoryProjectionDatabase();

  try {
    seedValidationErrors(database);

    expect(listValidationErrors(database, { code: "schema.required" })).toEqual([
      {
        code: "schema.required",
        severity: "error",
        message: "Spec version is required.",
        issue_id: "ISSUE-1000",
        file_path: ISSUE_1000_FILE_PATH,
      },
      {
        code: "schema.required",
        severity: "error",
        message: "Title is required.",
        file_path: ISSUE_1001_FILE_PATH,
        related_issue_ids: [],
      },
    ]);
  } finally {
    database.close();
  }
});
