import { normalizeIssueLinks, parseIssueMarkdown } from "../../core/parser/index.ts";
import { serializeIssueMarkdown } from "../../core/serialize/index.ts";
import type { Issue } from "../../core/types/index.ts";
import type { CreateIssueInput } from "./create-issue-input.ts";
import { DEFAULT_CREATE_ISSUE_BODY } from "./create-issue-default-body.ts";
import {
  createCreateIssueRequestValidationError,
  CreateIssueValidationError,
} from "./create-issue-validation-error.ts";

function createCreateInputValidationError(
  code: string,
  path: string,
  message: string,
  details?: Record<string, unknown>,
): CreateIssueValidationError {
  return new CreateIssueValidationError([
    createCreateIssueRequestValidationError({
      code,
      path,
      message,
      ...(details === undefined ? {} : { details }),
    }),
  ]);
}

function assertCreateIssueInputRecord(input: CreateIssueInput): void {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return;
  }

  throw createCreateInputValidationError(
    "create.invalid_payload",
    "/",
    "Create issue input must be a JSON object.",
  );
}

function normalizeCreateIssueLinks(
  links: CreateIssueInput["links"],
): Issue["links"] | undefined {
  try {
    return normalizeIssueLinks(links);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedLinkMatch = /^Failed to normalize link at index (\d+): /.exec(message);

    if (normalizedLinkMatch !== null) {
      const linkIndex = Number(normalizedLinkMatch[1]);

      throw createCreateInputValidationError(
        "create.invalid_links",
        `/links/${linkIndex}`,
        message,
        { index: linkIndex },
      );
    }

    throw createCreateInputValidationError(
      "create.invalid_links",
      "/links",
      message,
    );
  }
}

function buildIssueBase(input: CreateIssueInput, issueId: string) {
  assertCreateIssueInputRecord(input);
  const normalizedLinks = normalizeCreateIssueLinks(input.links);

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
