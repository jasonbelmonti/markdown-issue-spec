import type {
  IssueMutationBoundary,
  NotImplementedIssueMutationResult,
} from "./issue-mutation-boundary.ts";

const CREATE_ISSUE_NOT_IMPLEMENTED_RESULT = {
  status: "not_implemented",
  code: "issue_create_not_implemented",
  endpoint: "POST /issues",
} as const satisfies NotImplementedIssueMutationResult;

const PATCH_ISSUE_NOT_IMPLEMENTED_RESULT = {
  status: "not_implemented",
  code: "issue_patch_not_implemented",
  endpoint: "PATCH /issues/:id",
} as const satisfies NotImplementedIssueMutationResult;

export function createNotImplementedIssueMutationBoundary(): IssueMutationBoundary {
  return {
    async createIssue(_command) {
      return CREATE_ISSUE_NOT_IMPLEMENTED_RESULT;
    },

    async patchIssue(_command) {
      return PATCH_ISSUE_NOT_IMPLEMENTED_RESULT;
    },
  };
}
