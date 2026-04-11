import type { Database } from "bun:sqlite";

import { PROJECTION_TABLE_NAMES } from "./schema.ts";

export function clearProjectionState(database: Database): void {
  const clearProjectionStateTransaction = database.transaction(() => {
    database
      .query(`DELETE FROM ${PROJECTION_TABLE_NAMES.validationErrors}`)
      .run();

    // Issue-linked rows are removed by the issues table's ON DELETE CASCADE
    // constraints, so rebuild can start from a clean projection without
    // duplicating lower-level table maintenance here.
    database
      .query(`DELETE FROM ${PROJECTION_TABLE_NAMES.issues}`)
      .run();
  });

  clearProjectionStateTransaction();
}

export function clearProjectionStateForFilePath(
  database: Database,
  filePath: string,
): void {
  const clearProjectionStateForFilePathTransaction = database.transaction(
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

  clearProjectionStateForFilePathTransaction(filePath);
}
