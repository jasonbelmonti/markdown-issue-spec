import type { Database } from "bun:sqlite";
import { join } from "node:path";

import {
  listIssueEnvelopes,
  openProjectionDatabase,
  type ListIssueEnvelopesPage,
  type ListIssueEnvelopesQuery,
} from "../../projection/index.ts";

export type IssueListPageReader = (
  query: ListIssueEnvelopesQuery,
) => ListIssueEnvelopesPage;

export function createGetIssueListProjectionReader(
  databasePath = join(process.cwd(), ".mis", "index.sqlite"),
): IssueListPageReader {
  let database: Database | undefined;

  return (query) => {
    database ??= openProjectionDatabase(databasePath);

    return listIssueEnvelopes(database, query);
  };
}
