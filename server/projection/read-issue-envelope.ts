import type { Database } from "bun:sqlite";

import type { IssueEnvelope } from "../core/types/index.ts";
import { readIssueEnvelopeBase } from "./read-issue-envelope-base.ts";
import { deriveIssueEnvelopeFields } from "./read-issue-envelope-relations.ts";

export function readIssueEnvelope(
  database: Database,
  issueId: string,
): IssueEnvelope | null {
  const baseEnvelope = readIssueEnvelopeBase(database, issueId);

  if (baseEnvelope == null) {
    return null;
  }

  return {
    ...baseEnvelope,
    derived: deriveIssueEnvelopeFields(database, baseEnvelope.issue),
  };
}
