import { normalizeIssueLinks, parseIssueMarkdown } from "../../core/parser/index.ts";
import { serializeIssueMarkdown } from "../../core/serialize/index.ts";
import type { Issue } from "../../core/types/index.ts";
import type { CreateIssueInput } from "./create-issue-input.ts";
import { DEFAULT_CREATE_ISSUE_BODY } from "./create-issue-default-body.ts";

function buildIssueBase(input: CreateIssueInput, issueId: string) {
  const normalizedLinks = input.links === undefined
    ? undefined
    : normalizeIssueLinks(input.links);

  return {
    spec_version: input.spec_version,
    id: issueId,
    title: input.title,
    kind: input.kind,
    created_at: input.created_at,
    body: input.body ?? DEFAULT_CREATE_ISSUE_BODY,
    ...(input.updated_at !== undefined ? { updated_at: input.updated_at } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.labels !== undefined ? { labels: input.labels } : {}),
    ...(input.assignees !== undefined ? { assignees: input.assignees } : {}),
    ...(normalizedLinks !== undefined ? { links: normalizedLinks } : {}),
    ...(input.extensions !== undefined ? { extensions: input.extensions } : {}),
  };
}

function buildCandidateIssue(input: CreateIssueInput, issueId: string): Issue {
  const issueBase = buildIssueBase(input, issueId);

  switch (input.status) {
    case "completed":
      return {
        ...issueBase,
        status: "completed",
        resolution: input.resolution,
      };
    case "canceled":
      return {
        ...issueBase,
        status: "canceled",
        resolution: input.resolution,
      };
    default:
      return {
        ...issueBase,
        status: input.status,
      };
  }
}

export function parseCreateIssueCandidate(
  input: CreateIssueInput,
  issueId: string,
): Issue {
  return parseIssueMarkdown(
    serializeIssueMarkdown(buildCandidateIssue(input, issueId)),
  );
}
