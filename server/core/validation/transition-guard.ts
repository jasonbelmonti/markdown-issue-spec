import type {
  DependencyIssueLink,
  Issue,
  IssueLink,
  IssueStatus,
} from "../types/index.ts";
import {
  isDependencyLink,
  isDependencySatisfied,
  shouldEvaluateDependencyForTransition,
  type GuardedDependencyTransitionStatus,
} from "../dependency-readiness.ts";

export type TransitionGuardSource = "transition_guard";

export type GuardedIssueTransitionStatus = Extract<
  IssueStatus,
  "in_progress" | "completed"
>;

export type TransitionGuardErrorCode =
  | "transition.terminal_issue_closed"
  | "transition.completed_requires_in_progress"
  | "transition.dependency_not_satisfied";

export interface TransitionGuardError {
  code: TransitionGuardErrorCode;
  source: TransitionGuardSource;
  path: string;
  message: string;
  details?: Record<string, unknown>;
  related_issue_ids?: string[];
}

export interface EvaluateIssueTransitionGuardInput {
  issue: Issue;
  next_status: IssueStatus;
  known_dependency_issues?: readonly Issue[];
}

export interface IssueTransitionGuardResult {
  ok: boolean;
  errors: readonly TransitionGuardError[];
}

export interface RelevantDependencyLinkEntry {
  index: number;
  link: DependencyIssueLink;
}

interface KnownDependencyLinkEntry extends RelevantDependencyLinkEntry {
  dependencyIssue: Issue;
}

function compareTransitionGuardErrors(
  left: TransitionGuardError,
  right: TransitionGuardError,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function createTransitionGuardError(
  code: TransitionGuardErrorCode,
  path: string,
  message: string,
  details?: Record<string, unknown>,
  relatedIssueIds?: string[],
): TransitionGuardError {
  return {
    code,
    source: "transition_guard",
    path,
    message,
    details,
    related_issue_ids: relatedIssueIds,
  };
}

export function isGuardedIssueTransitionStatus(
  nextStatus: IssueStatus,
): nextStatus is GuardedIssueTransitionStatus {
  return nextStatus === "in_progress" || nextStatus === "completed";
}

function isTerminalIssueStatus(
  status: IssueStatus,
): status is Extract<IssueStatus, "completed" | "canceled"> {
  return status === "completed" || status === "canceled";
}

function readIssueResolution(issue: Issue): Issue["resolution"] | null {
  if (issue.status === "completed" || issue.status === "canceled") {
    return issue.resolution;
  }

  return null;
}

export function findRelevantDependencyLinks(
  issue: Issue,
  nextStatus: GuardedDependencyTransitionStatus,
): RelevantDependencyLinkEntry[] {
  const relevantLinks: RelevantDependencyLinkEntry[] = [];

  for (const [index, link] of (issue.links ?? []).entries()) {
    if (!isDependencyLink(link)) {
      continue;
    }

    if (!shouldEvaluateDependencyForTransition(issue.status, link, nextStatus)) {
      continue;
    }

    relevantLinks.push({ index, link });
  }

  return relevantLinks;
}

function findKnownUnsatisfiedDependencies(
  issue: Issue,
  nextStatus: GuardedIssueTransitionStatus,
  knownDependencyIssues: readonly Issue[],
): KnownDependencyLinkEntry[] {
  const dependencyIssuesById = new Map(
    knownDependencyIssues.map((dependencyIssue) => [
      dependencyIssue.id,
      dependencyIssue,
    ]),
  );
  const unsatisfiedDependencies: KnownDependencyLinkEntry[] = [];

  for (const entry of findRelevantDependencyLinks(issue, nextStatus)) {
    const dependencyIssue = dependencyIssuesById.get(entry.link.target.id);

    // This guard only evaluates the dependency targets supplied to it.
    if (dependencyIssue === undefined || isDependencySatisfied(dependencyIssue)) {
      continue;
    }

    unsatisfiedDependencies.push({
      ...entry,
      dependencyIssue,
    });
  }

  return unsatisfiedDependencies;
}

function validateCompletedTransitionPrerequisite(
  issue: Issue,
  nextStatus: GuardedIssueTransitionStatus,
): TransitionGuardError[] {
  if (nextStatus !== "completed" || issue.status === "in_progress") {
    return [];
  }

  return [
    createTransitionGuardError(
      "transition.completed_requires_in_progress",
      "/status",
      "Issue must enter `in_progress` before it can transition to `completed`.",
      {
        issueId: issue.id,
        currentStatus: issue.status,
        nextStatus,
      },
      [issue.id],
    ),
  ];
}

function validateTerminalIssueClosed(
  issue: Issue,
  nextStatus: IssueStatus,
): TransitionGuardError[] {
  if (!isTerminalIssueStatus(issue.status) || nextStatus === issue.status) {
    return [];
  }

  return [
    createTransitionGuardError(
      "transition.terminal_issue_closed",
      "/status",
      `Issue is already terminal with status \`${issue.status}\` and cannot transition to \`${nextStatus}\`.`,
      {
        issueId: issue.id,
        currentStatus: issue.status,
        nextStatus,
      },
      [issue.id],
    ),
  ];
}

function validateDependencyReadiness(
  issue: Issue,
  nextStatus: GuardedIssueTransitionStatus,
  knownDependencyIssues: readonly Issue[],
): TransitionGuardError[] {
  return findKnownUnsatisfiedDependencies(
    issue,
    nextStatus,
    knownDependencyIssues,
  ).map(({ index, link, dependencyIssue }) =>
    createTransitionGuardError(
      "transition.dependency_not_satisfied",
      `/links/${index}/target/id`,
      `Dependency issue ${dependencyIssue.id} must be \`completed\` with resolution \`done\` before this issue can transition to \`${nextStatus}\`.`,
      {
        issueId: issue.id,
        currentStatus: issue.status,
        nextStatus,
        dependencyIssueId: dependencyIssue.id,
        dependencyStatus: dependencyIssue.status,
        dependencyResolution: readIssueResolution(dependencyIssue),
        dependencyRequiredBefore: link.required_before,
      },
      [issue.id, dependencyIssue.id],
    ),
  );
}

export function evaluateIssueTransitionGuard(
  input: EvaluateIssueTransitionGuardInput,
): IssueTransitionGuardResult {
  const { issue, next_status: nextStatus, known_dependency_issues = [] } = input;

  if (nextStatus === issue.status) {
    return { ok: true, errors: [] };
  }

  const terminalIssueErrors = validateTerminalIssueClosed(issue, nextStatus);

  if (terminalIssueErrors.length > 0) {
    return {
      ok: false,
      errors: terminalIssueErrors,
    };
  }

  if (!isGuardedIssueTransitionStatus(nextStatus)) {
    return { ok: true, errors: [] };
  }

  const errors = [
    ...validateCompletedTransitionPrerequisite(issue, nextStatus),
    ...validateDependencyReadiness(issue, nextStatus, known_dependency_issues),
  ].sort(compareTransitionGuardErrors);

  return {
    ok: errors.length === 0,
    errors,
  };
}
