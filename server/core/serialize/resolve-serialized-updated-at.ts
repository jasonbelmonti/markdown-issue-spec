import type { Issue, Rfc3339Timestamp } from "../types/index.ts";
import type { SerializeIssueUpdatedAtPolicy } from "./types.ts";

export function resolveSerializedUpdatedAt(
  issue: Issue,
  policy: SerializeIssueUpdatedAtPolicy | undefined,
): Rfc3339Timestamp | undefined {
  if (policy === undefined || policy.mode === "preserve") {
    return issue.updated_at;
  }

  if (issue.updated_at !== undefined) {
    return policy.timestamp;
  }

  if (policy.addIfMissing === false) {
    return undefined;
  }

  return policy.timestamp;
}
