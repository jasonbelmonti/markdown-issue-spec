import type { Database } from "bun:sqlite";
import { join } from "node:path";

import type { IssueEnvelope } from "../../core/types/index.ts";
import {
  openProjectionDatabase,
  readIssueEnvelope,
} from "../../projection/index.ts";

export type GetIssueEnvelopeReader = (issueId: string) => IssueEnvelope | null;

export function createGetIssueProjectionReader(
  databasePath = join(process.cwd(), ".mis", "index.sqlite"),
): GetIssueEnvelopeReader {
  let database: Database | undefined;

  return (issueId) => {
    database ??= openProjectionDatabase(databasePath);

    return readIssueEnvelope(database, issueId);
  };
}
