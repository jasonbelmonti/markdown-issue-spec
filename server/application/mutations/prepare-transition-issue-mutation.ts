import {
  evaluateIssueTransitionGuard,
  isGuardedIssueTransitionStatus,
} from "../../core/validation/index.ts";
import type { Issue } from "../../core/types/index.ts";
import type {
  TransitionIssueMutationCommand,
  TransitionIssueMutationResult,
} from "./issue-mutation-boundary.ts";
import type { NormalizedTransitionIssueInput } from "./normalize-transition-issue-input.ts";
import { parseTransitionIssueCandidate } from "./transition-issue-candidate.ts";
import type { TransitionIssueFilesystemState } from "./transition-issue-filesystem-state.ts";
import { TransitionIssueValidationError } from "./transition-issue-validation-error.ts";

export interface PreparedTransitionIssueMutation {
  issue: Issue;
}

type TransitionRevisionMismatchResult = Extract<
  TransitionIssueMutationResult,
  { status: "revision_mismatch" }
>;

function createRevisionMismatchResult(
  command: TransitionIssueMutationCommand,
  input: NormalizedTransitionIssueInput,
  currentRevision: string,
): TransitionRevisionMismatchResult {
  return {
    status: "revision_mismatch",
    issueId: command.issueId,
    expectedRevision: input.expectedRevision,
    currentRevision,
  };
}

async function assertTransitionGuardSatisfied(
  state: TransitionIssueFilesystemState,
  currentIssue: Issue,
  input: NormalizedTransitionIssueInput,
): Promise<void> {
  const dependencyIssues =
    currentIssue.status !== input.to_status &&
    isGuardedIssueTransitionStatus(input.to_status)
      ? await state.loadDependencyIssues(input.to_status)
      : [];

  const guardResult = evaluateIssueTransitionGuard({
    issue: currentIssue,
    next_status: input.to_status,
    known_dependency_issues: dependencyIssues,
  });

  if (guardResult.ok) {
    return;
  }

  throw new TransitionIssueValidationError(guardResult.errors);
}

export async function prepareTransitionIssueMutation(
  state: TransitionIssueFilesystemState,
  command: TransitionIssueMutationCommand,
  input: NormalizedTransitionIssueInput,
): Promise<PreparedTransitionIssueMutation | TransitionRevisionMismatchResult> {
  const { issue: currentIssue, revision: currentRevision } = state.currentParsedIssue;

  if (currentRevision !== input.expectedRevision) {
    return createRevisionMismatchResult(command, input, currentRevision);
  }

  await assertTransitionGuardSatisfied(state, currentIssue, input);

  return {
    issue: parseTransitionIssueCandidate(currentIssue, input),
  };
}
