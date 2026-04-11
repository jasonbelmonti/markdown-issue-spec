import type {
  DependencyIssueLink,
  DerivedIssueFields,
  Issue,
  IssueEnvelope,
  IssueLink,
  IssueSource,
  IssueRevision,
  NonTerminalIssueStatus,
} from "../core/types/index.ts";

export interface ParsedStartupIssueFile {
  issue: Issue;
  revision: IssueRevision;
  source: IssueSource;
}

function isSatisfiedDependencyTarget(issue: Issue | undefined): boolean {
  return issue?.status === "completed" && issue.resolution === "done";
}

function getLinkTargetIds(
  issue: Issue,
  relation: IssueLink["rel"],
): string[] {
  return Array.from(
    new Set(
      (issue.links ?? [])
        .filter((link) => link.rel === relation)
        .map((link) => link.target.id),
    ),
  );
}

function getIncomingRelationIds(
  parsedIssues: readonly ParsedStartupIssueFile[],
  targetIssueId: string,
  relation: IssueLink["rel"],
): string[] {
  const sourceIssueIds = parsedIssues
    .filter(({ issue }) =>
      (issue.links ?? []).some(
        (link) => link.rel === relation && link.target.id === targetIssueId,
      ),
    )
    .map(({ issue }) => issue.id);

  return Array.from(new Set(sourceIssueIds)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function isDependencyLink(link: IssueLink): link is DependencyIssueLink {
  return link.rel === "depends_on";
}

function shouldEvaluateDependencyForTransition(
  issueStatus: NonTerminalIssueStatus,
  link: DependencyIssueLink,
  nextStatus: "in_progress" | "completed",
): boolean {
  if (nextStatus === "in_progress") {
    return link.required_before === "in_progress";
  }

  if (link.required_before === "completed") {
    return true;
  }

  return issueStatus !== "in_progress";
}

function getBlockingDependencyIds(
  issue: Issue,
  issuesById: ReadonlyMap<string, Issue>,
): string[] {
  const issueStatus = issue.status;

  if (issueStatus === "completed" || issueStatus === "canceled") {
    return [];
  }

  const blockingTransitionStatus =
    issueStatus === "in_progress" ? "completed" : "in_progress";

  return Array.from(
    new Set(
      (issue.links ?? [])
        .filter(isDependencyLink)
        .filter((link) =>
          shouldEvaluateDependencyForTransition(
            issueStatus,
            link,
            blockingTransitionStatus,
          ),
        )
        .map((link) => link.target.id)
        .filter(
          (dependencyIssueId) =>
            !isSatisfiedDependencyTarget(issuesById.get(dependencyIssueId)),
        ),
    ),
  );
}

function deriveStartupFields(
  parsedIssue: ParsedStartupIssueFile,
  parsedIssues: readonly ParsedStartupIssueFile[],
  issuesById: ReadonlyMap<string, Issue>,
): DerivedIssueFields {
  const { issue } = parsedIssue;
  const blockedByIds = getBlockingDependencyIds(issue, issuesById);

  return {
    children_ids: getIncomingRelationIds(parsedIssues, issue.id, "parent"),
    blocks_ids: getIncomingRelationIds(parsedIssues, issue.id, "depends_on"),
    blocked_by_ids: blockedByIds,
    duplicates_ids: getIncomingRelationIds(parsedIssues, issue.id, "duplicate_of"),
    ready: blockedByIds.length === 0,
    is_blocked: blockedByIds.length > 0,
  };
}

export function buildStartupIssueEnvelope(
  parsedIssue: ParsedStartupIssueFile,
  parsedIssues: readonly ParsedStartupIssueFile[],
  issuesById: ReadonlyMap<string, Issue>,
): IssueEnvelope {
  return {
    issue: parsedIssue.issue,
    derived: deriveStartupFields(parsedIssue, parsedIssues, issuesById),
    revision: parsedIssue.revision,
    source: parsedIssue.source,
  };
}
