import type { DependencyIssueLink, Issue, IssueLink } from "./types/index.ts";

export interface DependencyTargetState {
  status: Issue["status"];
  resolution?: Issue["resolution"] | null;
}

export type GuardedDependencyTransitionStatus = "in_progress" | "completed";

export function isDependencyLink(link: IssueLink): link is DependencyIssueLink {
  return link.rel === "depends_on";
}

export function isDependencySatisfied(
  issue: DependencyTargetState | undefined,
): boolean {
  return issue?.status === "completed" && issue.resolution === "done";
}

export function shouldEvaluateDependencyForTransition(
  issueStatus: Issue["status"],
  link: DependencyIssueLink,
  nextStatus: GuardedDependencyTransitionStatus,
): boolean {
  if (nextStatus === "in_progress") {
    return link.required_before === "in_progress";
  }

  if (link.required_before === "completed") {
    return true;
  }

  return issueStatus !== "in_progress";
}

export function getRelevantDependencyIdsForNextTransition(issue: Issue): string[] {
  const issueStatus = issue.status;

  if (issueStatus === "completed" || issueStatus === "canceled") {
    return [];
  }

  const nextStatus =
    issueStatus === "in_progress" ? "completed" : "in_progress";

  return Array.from(
    new Set(
      (issue.links ?? [])
        .filter(isDependencyLink)
        .filter((link) =>
          shouldEvaluateDependencyForTransition(issueStatus, link, nextStatus),
        )
        .map((link) => link.target.id),
    ),
  );
}

export function getUnsatisfiedDependencyIds(
  dependencyIssueIds: readonly string[],
  getDependencyState: (dependencyIssueId: string) => DependencyTargetState | undefined,
): string[] {
  return dependencyIssueIds.filter(
    (dependencyIssueId) => !isDependencySatisfied(getDependencyState(dependencyIssueId)),
  );
}
