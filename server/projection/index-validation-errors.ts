import type { Database } from "bun:sqlite";

import type { ValidationError } from "../core/types/index.ts";
import { serializeProjectionJson } from "./json.ts";
import { PROJECTION_TABLE_NAMES } from "./schema.ts";

export interface ValidationErrorIndexTarget {
  file_path: string;
}

function assertConsistentValidationErrorTarget(
  target: ValidationErrorIndexTarget,
  errors: ValidationError[],
): void {
  for (const error of errors) {
    if (error.file_path !== target.file_path) {
      throw new Error(
        `Validation error file path "${error.file_path}" does not match index target "${target.file_path}".`,
      );
    }
  }
}

function replaceValidationErrorsForTarget(
  database: Database,
  target: ValidationErrorIndexTarget,
): void {
  database
    .query(
      `DELETE FROM ${PROJECTION_TABLE_NAMES.validationErrors}
       WHERE file_path = ?1`,
    )
    .run(target.file_path);
}

function insertValidationError(
  database: Database,
  error: ValidationError,
  position: number,
): void {
  database
    .query(
      `INSERT INTO ${PROJECTION_TABLE_NAMES.validationErrors} (
         file_path,
         position,
         issue_id,
         code,
         severity,
         message,
         field_path,
         related_issue_ids_json
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .run(
      error.file_path,
      position,
      error.issue_id ?? null,
      error.code,
      error.severity,
      error.message,
      error.field_path ?? null,
      serializeProjectionJson(error.related_issue_ids),
    );
}

export function indexValidationErrors(
  database: Database,
  target: ValidationErrorIndexTarget,
  errors: ValidationError[],
): void {
  assertConsistentValidationErrorTarget(target, errors);
  replaceValidationErrorsForTarget(database, target);

  for (const [position, error] of errors.entries()) {
    insertValidationError(database, error, position);
  }
}
