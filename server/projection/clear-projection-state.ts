import type { Database } from "bun:sqlite";

import { PROJECTION_TABLE_NAMES } from "./schema.ts";

export function clearProjectionStateForFilePath(
  database: Database,
  filePath: string,
): void {
  const clearProjectionState = database.transaction(
    (transactionFilePath: string) => {
      database
        .query(
          `DELETE FROM ${PROJECTION_TABLE_NAMES.validationErrors}
           WHERE file_path = ?1`,
        )
        .run(transactionFilePath);

      database
        .query(
          `DELETE FROM ${PROJECTION_TABLE_NAMES.issues}
           WHERE file_path = ?1`,
        )
        .run(transactionFilePath);
    },
  );

  clearProjectionState(filePath);
}
