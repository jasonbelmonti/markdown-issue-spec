import type { Database } from "bun:sqlite";

import type { IssueEnvelope } from "../core/types/index.ts";
import { readIssueEnvelope } from "./read-issue-envelope.ts";
import {
  readIssueListPage,
  type ListIssueEnvelopesQuery,
} from "./read-issue-list-page.ts";

export interface ListIssueEnvelopesPage {
  items: IssueEnvelope[];
  nextCursor: string | null;
}

function hydrateIssueEnvelopes(
  database: Database,
  issueIds: readonly string[],
): IssueEnvelope[] {
  return issueIds.map((issueId) => {
    const envelope = readIssueEnvelope(database, issueId);

    if (envelope == null) {
      throw new Error(
        `Projected issue "${issueId}" disappeared during issue list hydration.`,
      );
    }

    return envelope;
  });
}

export function listIssueEnvelopes(
  database: Database,
  query: ListIssueEnvelopesQuery,
): ListIssueEnvelopesPage {
  const page = readIssueListPage(database, query);

  return {
    items: hydrateIssueEnvelopes(database, page.issueIds),
    nextCursor: page.nextCursor,
  };
}

export type { ListIssueEnvelopesQuery } from "./read-issue-list-page.ts";
