import type { Rfc3339Timestamp } from "../types/index.ts";

export interface PreserveUpdatedAtPolicy {
  mode?: "preserve";
}

export interface CanonicalMutationUpdatedAtPolicy {
  mode: "canonical_mutation";
  timestamp: Rfc3339Timestamp;
  addIfMissing?: boolean;
}

export type SerializeIssueUpdatedAtPolicy =
  | PreserveUpdatedAtPolicy
  | CanonicalMutationUpdatedAtPolicy;

export interface SerializeIssueMarkdownOptions {
  updatedAt?: SerializeIssueUpdatedAtPolicy;
}
