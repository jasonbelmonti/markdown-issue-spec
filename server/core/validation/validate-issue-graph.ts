import type { Issue, ValidationError } from "../types/index.ts";

type GraphRelation = "parent" | "depends_on";

interface GraphRelationValidationRule {
  relation: GraphRelation;
  code: ValidationError["code"];
  message: string;
}

export interface GraphValidationIssue {
  issue: Issue;
  file_path: string;
}

const GRAPH_RELATION_VALIDATION_RULES = [
  {
    relation: "parent",
    code: "graph.parent_cycle",
    message: "Parent graph contains a cycle.",
  },
  {
    relation: "depends_on",
    code: "graph.depends_on_cycle",
    message: "Depends-on graph contains a cycle.",
  },
] as const satisfies readonly GraphRelationValidationRule[];

function compareIssueIds(left: string, right: string): number {
  return left.localeCompare(right);
}

function sortUniqueIssueIds(issueIds: readonly string[] | undefined): string[] | undefined {
  if (issueIds === undefined || issueIds.length === 0) {
    return issueIds === undefined ? undefined : [];
  }

  return Array.from(new Set(issueIds)).sort(compareIssueIds);
}

function sortGraphValidationIssues(
  issues: readonly GraphValidationIssue[],
): GraphValidationIssue[] {
  return [...issues].sort(
    (left, right) =>
      compareIssueIds(left.issue.id, right.issue.id) ||
      left.file_path.localeCompare(right.file_path),
  );
}

function collectIssueFilePaths(
  issues: readonly GraphValidationIssue[],
): ReadonlyMap<string, string> {
  return new Map(issues.map(({ issue, file_path: filePath }) => [issue.id, filePath]));
}

function createValidationError(
  input: Omit<ValidationError, "severity" | "related_issue_ids"> & {
    related_issue_ids?: readonly string[];
  },
): ValidationError {
  return {
    ...input,
    severity: "error",
    related_issue_ids: sortUniqueIssueIds(input.related_issue_ids),
  };
}

function validateUnresolvedReferences(
  issues: readonly GraphValidationIssue[],
  knownIssueIds: ReadonlySet<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const { issue, file_path: filePath } of issues) {
    for (const [index, link] of (issue.links ?? []).entries()) {
      const targetIssueId = link.target.id;

      if (knownIssueIds.has(targetIssueId)) {
        continue;
      }

      errors.push(
        createValidationError({
          code: "graph.unresolved_reference",
          message: "Issue references a target that was not found in the current graph.",
          issue_id: issue.id,
          file_path: filePath,
          field_path: `links[${index}].target`,
          related_issue_ids: [targetIssueId],
        }),
      );
    }
  }

  return errors;
}

function collectRelationTargets(
  issue: Issue,
  relation: GraphRelation,
  knownIssueIds: ReadonlySet<string>,
): string[] {
  const targetIssueIds = new Set<string>();

  for (const link of issue.links ?? []) {
    if (link.rel !== relation || !knownIssueIds.has(link.target.id)) {
      continue;
    }

    targetIssueIds.add(link.target.id);
  }

  return Array.from(targetIssueIds).sort(compareIssueIds);
}

function buildRelationAdjacency(
  issues: readonly GraphValidationIssue[],
  relation: GraphRelation,
  knownIssueIds: ReadonlySet<string>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    issues.map(({ issue }) => [
      issue.id,
      collectRelationTargets(issue, relation, knownIssueIds),
    ]),
  );
}

function findStronglyConnectedComponents(
  adjacency: ReadonlyMap<string, readonly string[]>,
): string[][] {
  let nextIndex = 0;
  const stack: string[] = [];
  const activeIssueIds = new Set<string>();
  const issueIndices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const components: string[][] = [];

  function visit(issueId: string): void {
    issueIndices.set(issueId, nextIndex);
    lowLinks.set(issueId, nextIndex);
    nextIndex += 1;

    stack.push(issueId);
    activeIssueIds.add(issueId);

    for (const targetIssueId of adjacency.get(issueId) ?? []) {
      if (!issueIndices.has(targetIssueId)) {
        visit(targetIssueId);
        lowLinks.set(
          issueId,
          Math.min(lowLinks.get(issueId)!, lowLinks.get(targetIssueId)!),
        );
        continue;
      }

      if (!activeIssueIds.has(targetIssueId)) {
        continue;
      }

      lowLinks.set(
        issueId,
        Math.min(lowLinks.get(issueId)!, issueIndices.get(targetIssueId)!),
      );
    }

    if (lowLinks.get(issueId) !== issueIndices.get(issueId)) {
      return;
    }

    const component: string[] = [];

    while (stack.length > 0) {
      const memberIssueId = stack.pop()!;

      activeIssueIds.delete(memberIssueId);
      component.push(memberIssueId);

      if (memberIssueId === issueId) {
        break;
      }
    }

    components.push(component.sort(compareIssueIds));
  }

  for (const issueId of Array.from(adjacency.keys()).sort(compareIssueIds)) {
    if (issueIndices.has(issueId)) {
      continue;
    }

    visit(issueId);
  }

  return components.sort(
    (left, right) => compareIssueIds(left[0]!, right[0]!) || left.length - right.length,
  );
}

function validateRelationCycles(
  issues: readonly GraphValidationIssue[],
  issueFilePaths: ReadonlyMap<string, string>,
  knownIssueIds: ReadonlySet<string>,
  rule: GraphRelationValidationRule,
): ValidationError[] {
  const adjacency = buildRelationAdjacency(issues, rule.relation, knownIssueIds);
  const cycleComponents = findStronglyConnectedComponents(adjacency).filter(
    (component) => component.length > 1,
  );
  const errors: ValidationError[] = [];

  for (const component of cycleComponents) {
    for (const issueId of component) {
      const relatedIssueIds = component.filter(
        (componentIssueId) => componentIssueId !== issueId,
      );

      errors.push(
        createValidationError({
          code: rule.code,
          message: rule.message,
          issue_id: issueId,
          file_path: issueFilePaths.get(issueId)!,
          related_issue_ids: relatedIssueIds,
        }),
      );
    }
  }

  return errors;
}

export function validateIssueGraph(
  issues: readonly GraphValidationIssue[],
): ValidationError[] {
  const sortedIssues = sortGraphValidationIssues(issues);
  const knownIssueIds = new Set(sortedIssues.map(({ issue }) => issue.id));
  const issueFilePaths = collectIssueFilePaths(sortedIssues);

  return [
    ...validateUnresolvedReferences(sortedIssues, knownIssueIds),
    ...GRAPH_RELATION_VALIDATION_RULES.flatMap((rule) =>
      validateRelationCycles(sortedIssues, issueFilePaths, knownIssueIds, rule),
    ),
  ];
}
