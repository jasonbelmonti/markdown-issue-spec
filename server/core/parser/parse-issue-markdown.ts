import type {
  CanceledIssueResolution,
  CompletedIssueResolution,
  ExtensionMap,
  Issue,
  IssueLink,
  IssueResolution,
  IssueSpecVersion,
  IssueStatus,
} from "../types/index.ts";
import {
  parseMarkdownFrontmatterDocument,
  type ParsedMarkdownFrontmatterDocument,
} from "./frontmatter.ts";
import { normalizeIssueLinks } from "./normalize-issue-link.ts";
import {
  readOptionalExtensionMap,
  readOptionalString,
  readOptionalStringArray,
  readRequiredString,
} from "./record-helpers.ts";

const ISSUE_SPEC_VERSIONS = ["mis/0.1"] as const satisfies readonly IssueSpecVersion[];
const ISSUE_STATUSES = [
  "proposed",
  "accepted",
  "in_progress",
  "completed",
  "canceled",
] as const satisfies readonly IssueStatus[];
const ISSUE_RESOLUTIONS = [
  "done",
  "duplicate",
  "obsolete",
  "wont_do",
  "superseded",
] as const satisfies readonly IssueResolution[];

interface ParsedIssueBaseFields {
  spec_version: IssueSpecVersion;
  id: string;
  title: string;
  kind: string;
  created_at: string;
  updated_at?: string;
  summary?: string;
  body?: string;
  priority?: string;
  labels?: string[];
  assignees?: string[];
  links?: IssueLink[];
  extensions?: ExtensionMap;
}

function readSpecVersion(record: Record<string, unknown>): IssueSpecVersion {
  const value = readRequiredString(record, "spec_version");

  if (!(ISSUE_SPEC_VERSIONS as readonly string[]).includes(value)) {
    throw new Error(`Unsupported issue spec version: ${value}`);
  }

  return value as IssueSpecVersion;
}

function readStatus(record: Record<string, unknown>): IssueStatus {
  const value = readRequiredString(record, "status");

  if (!(ISSUE_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unsupported issue status: ${value}`);
  }

  return value as IssueStatus;
}

function readResolution(record: Record<string, unknown>): IssueResolution {
  const value = readRequiredString(record, "resolution");

  if (!(ISSUE_RESOLUTIONS as readonly string[]).includes(value)) {
    throw new Error(`Unsupported issue resolution: ${value}`);
  }

  return value as IssueResolution;
}

function readCompletedResolution(
  record: Record<string, unknown>,
): CompletedIssueResolution {
  const resolution = readResolution(record);

  if (resolution !== "done") {
    throw new Error("Completed issues must use `resolution: done`.");
  }

  return resolution;
}

function readCanceledResolution(
  record: Record<string, unknown>,
): CanceledIssueResolution {
  const resolution = readResolution(record);

  if (resolution === "done") {
    throw new Error("Canceled issues cannot use `resolution: done`.");
  }

  return resolution;
}

function assertNonTerminalStatusHasNoResolution(
  record: Record<string, unknown>,
  status: Exclude<IssueStatus, "completed" | "canceled">,
): void {
  if ("resolution" in record) {
    throw new Error(
      `Non-terminal issues with status \`${status}\` must not declare \`resolution\`.`,
    );
  }
}

function assertNoForbiddenFrontmatterFields(
  record: Record<string, unknown>,
): void {
  if ("body" in record) {
    throw new Error(
      "Markdown frontmatter must not declare `body`; use the Markdown document body instead.",
    );
  }

  if ("description" in record) {
    throw new Error(
      "Markdown frontmatter must not declare `description`; use the Markdown document body instead.",
    );
  }
}

function buildIssueBase(
  frontmatter: Record<string, unknown>,
  body?: string,
): ParsedIssueBaseFields {
  const issueBase: ParsedIssueBaseFields = {
    spec_version: readSpecVersion(frontmatter),
    id: readRequiredString(frontmatter, "id"),
    title: readRequiredString(frontmatter, "title"),
    kind: readRequiredString(frontmatter, "kind"),
    created_at: readRequiredString(frontmatter, "created_at"),
  };

  const updatedAt = readOptionalString(frontmatter, "updated_at");
  const summary = readOptionalString(frontmatter, "summary");
  const priority = readOptionalString(frontmatter, "priority");
  const labels = readOptionalStringArray(frontmatter, "labels");
  const assignees = readOptionalStringArray(frontmatter, "assignees");
  const links = normalizeIssueLinks(frontmatter.links);
  const extensions = readOptionalExtensionMap(frontmatter, "extensions");

  if (updatedAt !== undefined) {
    issueBase.updated_at = updatedAt;
  }

  if (summary !== undefined) {
    issueBase.summary = summary;
  }

  if (body !== undefined) {
    issueBase.body = body;
  }

  if (priority !== undefined) {
    issueBase.priority = priority;
  }

  if (labels !== undefined) {
    issueBase.labels = labels;
  }

  if (assignees !== undefined) {
    issueBase.assignees = assignees;
  }

  if (links !== undefined) {
    issueBase.links = links;
  }

  if (extensions !== undefined) {
    issueBase.extensions = extensions;
  }

  return issueBase;
}

export function parseIssueFromMarkdownDocument(
  document: ParsedMarkdownFrontmatterDocument,
): Issue {
  assertNoForbiddenFrontmatterFields(document.frontmatter);

  const status = readStatus(document.frontmatter);
  const issueBase = buildIssueBase(document.frontmatter, document.body);

  if (status === "completed") {
    return {
      ...issueBase,
      status: "completed",
      resolution: readCompletedResolution(document.frontmatter),
    };
  }

  if (status === "canceled") {
    return {
      ...issueBase,
      status: "canceled",
      resolution: readCanceledResolution(document.frontmatter),
    };
  }

  assertNonTerminalStatusHasNoResolution(document.frontmatter, status);

  return {
    ...issueBase,
    status,
  };
}

export function parseIssueMarkdown(source: string): Issue {
  return parseIssueFromMarkdownDocument(parseMarkdownFrontmatterDocument(source));
}
