import type { Database } from "bun:sqlite";
import { join } from "node:path";

import {
  listValidationErrors,
  openProjectionDatabase,
  type ListValidationErrorsQuery,
} from "../../projection/index.ts";
import type { ValidationError } from "../../core/types/index.ts";

export type ValidationErrorListReader = (
  query: ListValidationErrorsQuery,
) => ValidationError[];

export function createGetValidationErrorListProjectionReader(
  databasePath = join(process.cwd(), ".mis", "index.sqlite"),
): ValidationErrorListReader {
  let database: Database | undefined;

  return (query) => {
    database ??= openProjectionDatabase(databasePath);

    return listValidationErrors(database, query);
  };
}
