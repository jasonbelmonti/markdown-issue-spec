import type { Database } from "bun:sqlite";

import type { IssueEnvelope, ValidationError } from "../core/types/index.ts";
import { indexIssueEnvelope } from "./index-issue.ts";
import { indexValidationErrors } from "./index-validation-errors.ts";
import { PROJECTION_TABLE_NAMES } from "./schema.ts";

export interface ReplaceProjectionStateInput {
  issueEnvelopes: readonly IssueEnvelope[];
  validationErrorsByFilePath: ReadonlyMap<string, readonly ValidationError[]>;
}

export function replaceProjectionState(
  database: Database,
  input: ReplaceProjectionStateInput,
): void {
  const replaceProjectionStateTransaction = database.transaction(
    (transactionInput: ReplaceProjectionStateInput) => {
      database
        .query(`DELETE FROM ${PROJECTION_TABLE_NAMES.validationErrors}`)
        .run();

      // Issue-linked rows are removed by the issues table's ON DELETE CASCADE
      // constraints, so replacing the snapshot only needs to clear top-level rows.
      database
        .query(`DELETE FROM ${PROJECTION_TABLE_NAMES.issues}`)
        .run();

      for (const issueEnvelope of transactionInput.issueEnvelopes) {
        indexIssueEnvelope(database, issueEnvelope);
        indexValidationErrors(
          database,
          { file_path: issueEnvelope.source.file_path },
          transactionInput.validationErrorsByFilePath.get(
            issueEnvelope.source.file_path,
          ) ?? [],
        );
      }
    },
  );

  replaceProjectionStateTransaction(input);
}
