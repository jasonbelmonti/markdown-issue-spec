import { parseIssueMarkdown } from "../../core/parser/index.ts";
import { serializeIssueMarkdown } from "../../core/serialize/index.ts";
import type { Issue } from "../../core/types/index.ts";
import type { CreateIssueInput } from "./create-issue-input.ts";
import { DEFAULT_CREATE_ISSUE_BODY } from "./create-issue-default-body.ts";
import {
  normalizeCreateIssueInput,
  type NormalizedCreateIssueInput,
} from "./normalize-create-issue-input.ts";

function buildIssueBase(input: NormalizedCreateIssueInput, issueId: string) {
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
    ...(input.links !== undefined ? { links: input.links } : {}),
    ...(input.extensions !== undefined ? { extensions: input.extensions } : {}),
  };
}

function buildCandidateIssue(
  input: NormalizedCreateIssueInput,
  issueId: string,
): Issue {
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
  const normalizedInput = normalizeCreateIssueInput(input);

  return parseIssueMarkdown(
    serializeIssueMarkdown(buildCandidateIssue(normalizedInput, issueId)),
  );
}
