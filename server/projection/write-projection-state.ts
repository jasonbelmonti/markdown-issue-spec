import type { Database } from "bun:sqlite";

import type { IssueEnvelope, ValidationError } from "../core/types/index.ts";
import { indexIssueEnvelope } from "./index-issue.ts";
import { indexValidationErrors } from "./index-validation-errors.ts";

export interface ProjectionStateWriteInput {
  issueEnvelope: IssueEnvelope;
  validationErrors: ValidationError[];
}

export function writeProjectionState(
  database: Database,
  input: ProjectionStateWriteInput,
): void {
  const writeTransaction = database.transaction((transactionInput: ProjectionStateWriteInput) => {
    indexIssueEnvelope(database, transactionInput.issueEnvelope);
    indexValidationErrors(
      database,
      { file_path: transactionInput.issueEnvelope.source.file_path },
      transactionInput.validationErrors,
    );
  });

  writeTransaction(input);
}
