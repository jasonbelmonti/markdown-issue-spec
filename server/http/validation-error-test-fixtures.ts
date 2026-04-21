import type { Database } from "bun:sqlite";

import type { ValidationError } from "../core/types/index.ts";
import { indexValidationErrors } from "../projection/index.ts";

const ISSUE_1000_FILE_PATH = "vault/issues/ISSUE-1000.md";
const ISSUE_1001_FILE_PATH = "vault/issues/ISSUE-1001.md";

export const ISSUE_1000_UNRESOLVED_REFERENCE_VALIDATION_ERROR: ValidationError = {
  code: "graph.unresolved_reference",
  severity: "error",
  message: "Referenced issue was not found in the current graph.",
  issue_id: "ISSUE-1000",
  file_path: ISSUE_1000_FILE_PATH,
  field_path: "links[0].target",
  related_issue_ids: ["ISSUE-0999"],
};

export const ISSUE_1000_SCHEMA_REQUIRED_VALIDATION_ERROR: ValidationError = {
  code: "schema.required",
  severity: "error",
  message: "Spec version is required.",
  issue_id: "ISSUE-1000",
  file_path: ISSUE_1000_FILE_PATH,
};

export const ISSUE_1001_DUPLICATE_STATE_VALIDATION_ERROR: ValidationError = {
  code: "semantic.duplicate_state",
  severity: "warning",
  message: "Duplicate state remains policy-dependent.",
  issue_id: "ISSUE-1001",
  file_path: ISSUE_1001_FILE_PATH,
  field_path: "status",
  related_issue_ids: ["ISSUE-2000"],
};

export const ISSUE_1001_SCHEMA_REQUIRED_VALIDATION_ERROR: ValidationError = {
  code: "schema.required",
  severity: "error",
  message: "Title is required.",
  file_path: ISSUE_1001_FILE_PATH,
  related_issue_ids: [],
};

export const PROJECTED_VALIDATION_ERRORS: ValidationError[] = [
  ISSUE_1000_UNRESOLVED_REFERENCE_VALIDATION_ERROR,
  ISSUE_1000_SCHEMA_REQUIRED_VALIDATION_ERROR,
  ISSUE_1001_DUPLICATE_STATE_VALIDATION_ERROR,
  ISSUE_1001_SCHEMA_REQUIRED_VALIDATION_ERROR,
];

function listProjectedValidationErrorsForFile(
  filePath: string,
): ValidationError[] {
  return PROJECTED_VALIDATION_ERRORS.filter((error) => error.file_path === filePath);
}

export function indexProjectedValidationErrors(database: Database): void {
  indexValidationErrors(database, {
    file_path: ISSUE_1000_FILE_PATH,
  }, listProjectedValidationErrorsForFile(ISSUE_1000_FILE_PATH));
  indexValidationErrors(database, {
    file_path: ISSUE_1001_FILE_PATH,
  }, listProjectedValidationErrorsForFile(ISSUE_1001_FILE_PATH));
}
