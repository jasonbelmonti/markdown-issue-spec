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
  assertValidIssueSemantics,
  assertValidMarkdownFrontmatter,
} from "../validation/index.ts";
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
  return readRequiredString(record, "spec_version") as IssueSpecVersion;
}

function readStatus(record: Record<string, unknown>): IssueStatus {
  return readRequiredString(record, "status") as IssueStatus;
}

function readResolution(record: Record<string, unknown>): IssueResolution {
  return readRequiredString(record, "resolution") as IssueResolution;
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
  assertValidMarkdownFrontmatter(document.frontmatter);
  const status = readStatus(document.frontmatter);
  const issueBase = buildIssueBase(document.frontmatter, document.body);
  let issue: Issue;

  if (status === "completed") {
    issue = {
      ...issueBase,
      status: "completed",
      resolution: readCompletedResolution(document.frontmatter),
    };
  } else if (status === "canceled") {
    issue = {
      ...issueBase,
      status: "canceled",
      resolution: readCanceledResolution(document.frontmatter),
    };
  } else {
    issue = {
      ...issueBase,
      status,
    };
  }

  assertValidIssueSemantics(issue);

  return issue;
}

export function parseIssueMarkdown(source: string): Issue {
  return parseIssueFromMarkdownDocument(parseMarkdownFrontmatterDocument(source));
}
