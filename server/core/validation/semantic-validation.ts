import type { Issue, IssueLink } from "../types/index.ts";

export type SemanticValidationSource = "semantic";

export interface SemanticValidationError {
  code: string;
  source: SemanticValidationSource;
  path: string;
  message: string;
  details?: Record<string, unknown>;
  related_issue_ids?: string[];
}

interface IssueLinkEntry {
  index: number;
  link: IssueLink;
}

function formatPath(path: string): string {
  return path.length === 0 ? "<issue>" : path;
}

function compareValidationErrors(
  left: SemanticValidationError,
  right: SemanticValidationError,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function createSemanticValidationError(
  code: string,
  path: string,
  message: string,
  details?: Record<string, unknown>,
  relatedIssueIds?: string[],
): SemanticValidationError {
  return {
    code,
    source: "semantic",
    path,
    message,
    details,
    related_issue_ids: relatedIssueIds,
  };
}

function formatSemanticValidationErrors(
  errors: readonly SemanticValidationError[],
): string {
  if (errors.length === 0) {
    return "Issue semantic validation failed.";
  }

  if (errors.length === 1) {
    return errors[0]!.message;
  }

  return [
    "Issue semantic validation failed:",
    ...errors.map((error) => `- ${formatPath(error.path)}: ${error.message}`),
  ].join("\n");
}

function findLinkEntries(
  issue: Issue,
  predicate: (link: IssueLink) => boolean,
): IssueLinkEntry[] {
  return (issue.links ?? [])
    .map((link, index) => ({ index, link }))
    .filter(({ link }) => predicate(link));
}

function validateSelfLinks(issue: Issue): SemanticValidationError[] {
  return findLinkEntries(issue, (link) => link.target.id === issue.id).map(
    ({ index, link }) =>
      createSemanticValidationError(
        "semantic.self_link",
        `/links/${index}/target/id`,
        "Issue links must not target the source issue itself.",
        {
          issueId: issue.id,
          rel: link.rel,
          targetIssueId: link.target.id,
        },
        [issue.id],
      ),
  );
}

export function validateIssueSemantics(issue: Issue): SemanticValidationError[] {
  return validateSelfLinks(issue).sort(compareValidationErrors);
}

export class IssueSemanticValidationError extends Error {
  readonly errors: readonly SemanticValidationError[];

  constructor(errors: readonly SemanticValidationError[]) {
    super(formatSemanticValidationErrors(errors));
    this.name = "IssueSemanticValidationError";
    this.errors = [...errors];
  }
}

export function assertValidIssueSemantics(issue: Issue): void {
  const errors = validateIssueSemantics(issue);

  if (errors.length === 0) {
    return;
  }

  throw new IssueSemanticValidationError(errors);
}
