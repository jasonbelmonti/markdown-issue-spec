import type { IssueEnvelope } from "../../core/types/index.ts";
import type { AppliedIssueMutationResult } from "./issue-mutation-boundary.ts";
import { finalizePersistedIssueMutation } from "./finalize-persisted-issue-mutation.ts";

export interface CompleteAppliedIssueMutationOptions {
  persist: () => Promise<IssueEnvelope>;
  rollback: () => Promise<void>;
  afterPersist?: () => Promise<void>;
}

export async function completeAppliedIssueMutation(
  options: CompleteAppliedIssueMutationOptions,
): Promise<AppliedIssueMutationResult> {
  const envelope = await finalizePersistedIssueMutation(options);

  return {
    status: "applied",
    issue: envelope.issue,
    envelope,
    revision: envelope.revision,
  };
}
