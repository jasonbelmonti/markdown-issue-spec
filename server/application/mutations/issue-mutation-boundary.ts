import type { Issue, IssueEnvelope, IssueRevision } from "../../core/types/index.ts";
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
  envelope: IssueEnvelope;
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

export type CreateIssueMutationBoundary = Pick<
  IssueMutationBoundary,
  "createIssue"
>;

export type PatchIssueMutationBoundary = Pick<
  IssueMutationBoundary,
  "patchIssue"
>;
