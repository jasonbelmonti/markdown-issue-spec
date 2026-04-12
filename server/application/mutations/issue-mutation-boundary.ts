import type {
  Issue,
  IssueEnvelope,
  IssueRevision,
} from "../../core/types/index.ts";
import type { CreateIssueInput } from "./create-issue-input.ts";
import type { PatchIssueInput } from "./patch-issue-input.ts";

export interface CreateIssueMutationCommand {
  kind: "create_issue";
  input: CreateIssueInput;
}

export interface PatchIssueMutationCommand {
  kind: "patch_issue";
  issueId: string;
  input: PatchIssueInput;
}

export interface AppliedIssueMutationResult {
  status: "applied";
  issue: Issue;
  envelope: IssueEnvelope;
  revision: IssueRevision;
}

export interface RevisionMismatchIssueMutationResult {
  status: "revision_mismatch";
  issueId: string;
  expectedRevision: IssueRevision;
  currentRevision: IssueRevision;
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
  | RevisionMismatchIssueMutationResult
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
