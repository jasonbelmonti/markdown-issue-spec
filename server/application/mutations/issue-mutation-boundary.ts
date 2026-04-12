import type { Issue, IssueRevision } from "../../core/types/index.ts";
import type { CreateIssueInput } from "./create-issue-input.ts";

export interface CreateIssueMutationCommand {
  kind: "create_issue";
  input: CreateIssueInput;
}

export interface PatchIssueMutationCommand {
  kind: "patch_issue";
  issueId: string;
}

export interface AppliedIssueMutationResult {
  status: "applied";
  issue: Issue;
  revision: IssueRevision;
}

export interface NotImplementedIssueMutationResult {
  status: "not_implemented";
  code: string;
  endpoint: string;
}

export type CreateIssueMutationResult =
  | AppliedIssueMutationResult
  | NotImplementedIssueMutationResult;

export type PatchIssueMutationResult =
  | AppliedIssueMutationResult
  | NotImplementedIssueMutationResult;

export interface IssueMutationBoundary {
  createIssue(
    command: CreateIssueMutationCommand,
  ): Promise<CreateIssueMutationResult>;
  patchIssue(
    command: PatchIssueMutationCommand,
  ): Promise<PatchIssueMutationResult>;
}

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

export type CreateIssueMutationBoundary = Pick<
  IssueMutationBoundary,
  "createIssue"
>;

export type PatchIssueMutationBoundary = Pick<
  IssueMutationBoundary,
  "patchIssue"
>;

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
