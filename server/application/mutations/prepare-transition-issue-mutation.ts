import { evaluateIssueTransitionGuard } from "../../core/validation/index.ts";
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

function assertTransitionGuardSatisfied(
  state: TransitionIssueFilesystemState,
  currentIssue: Issue,
  input: NormalizedTransitionIssueInput,
): void {
  const guardResult = evaluateIssueTransitionGuard({
    issue: currentIssue,
    next_status: input.to_status,
    known_dependency_issues: state.currentParsedIssues.map(
      (parsedIssue) => parsedIssue.issue,
    ),
  });

  if (guardResult.ok) {
    return;
  }

  throw new TransitionIssueValidationError(guardResult.errors);
}

export function prepareTransitionIssueMutation(
  state: TransitionIssueFilesystemState,
  command: TransitionIssueMutationCommand,
  input: NormalizedTransitionIssueInput,
): PreparedTransitionIssueMutation | TransitionRevisionMismatchResult {
  const { issue: currentIssue, revision: currentRevision } = state.currentParsedIssue;

  if (currentRevision !== input.expectedRevision) {
    return createRevisionMismatchResult(command, input, currentRevision);
  }

  assertTransitionGuardSatisfied(state, currentIssue, input);

  return {
    issue: parseTransitionIssueCandidate(currentIssue, input),
  };
}
