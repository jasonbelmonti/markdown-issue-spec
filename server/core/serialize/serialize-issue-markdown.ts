import { stringify as stringifyYaml } from "yaml";

import type {
  Issue,
  IssueLink,
  IssueRef,
  Rfc3339Timestamp,
} from "../types/index.ts";

export interface PreserveUpdatedAtPolicy {
  mode?: "preserve";
}

export interface CanonicalMutationUpdatedAtPolicy {
  mode: "canonical_mutation";
  timestamp: Rfc3339Timestamp;
  addIfMissing?: boolean;
}

export type SerializeIssueUpdatedAtPolicy =
  | PreserveUpdatedAtPolicy
  | CanonicalMutationUpdatedAtPolicy;

export interface SerializeIssueMarkdownOptions {
  updatedAt?: SerializeIssueUpdatedAtPolicy;
}

function resolveSerializedUpdatedAt(
  issue: Issue,
  policy: SerializeIssueUpdatedAtPolicy | undefined,
): Rfc3339Timestamp | undefined {
  const mode = policy?.mode ?? "preserve";

  if (mode === "preserve") {
    return issue.updated_at;
  }

  if (issue.updated_at !== undefined) {
    return policy.timestamp;
  }

  if (policy.addIfMissing === false) {
    return undefined;
  }

  return policy.timestamp;
}

function serializeIssueRef(target: IssueRef): string | Record<string, string> {
  if (
    target.href === undefined &&
    target.path === undefined &&
    target.title === undefined
  ) {
    return target.id;
  }

  const serializedTarget: Record<string, string> = {
    id: target.id,
  };

  if (target.href !== undefined) {
    serializedTarget.href = target.href;
  }

  if (target.path !== undefined) {
    serializedTarget.path = target.path;
  }

  if (target.title !== undefined) {
    serializedTarget.title = target.title;
  }

  return serializedTarget;
}

function serializeIssueLink(link: IssueLink): Record<string, unknown> {
  const serializedLink: Record<string, unknown> = {
    rel: link.rel,
    target: serializeIssueRef(link.target),
  };

  if (link.rel === "depends_on") {
    serializedLink.required_before = link.required_before;
  }

  if (link.note !== undefined) {
    serializedLink.note = link.note;
  }

  if (link.extensions !== undefined) {
    serializedLink.extensions = link.extensions;
  }

  return serializedLink;
}

function buildIssueFrontmatterRecord(
  issue: Issue,
  options: SerializeIssueMarkdownOptions,
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    spec_version: issue.spec_version,
    id: issue.id,
    title: issue.title,
    kind: issue.kind,
    status: issue.status,
  };

  if (issue.status === "completed" || issue.status === "canceled") {
    frontmatter.resolution = issue.resolution;
  }

  frontmatter.created_at = issue.created_at;

  const updatedAt = resolveSerializedUpdatedAt(issue, options.updatedAt);

  if (updatedAt !== undefined) {
    frontmatter.updated_at = updatedAt;
  }

  if (issue.summary !== undefined) {
    frontmatter.summary = issue.summary;
  }

  if (issue.priority !== undefined) {
    frontmatter.priority = issue.priority;
  }

  if (issue.labels !== undefined) {
    frontmatter.labels = issue.labels;
  }

  if (issue.assignees !== undefined) {
    frontmatter.assignees = issue.assignees;
  }

  if (issue.links !== undefined) {
    frontmatter.links = issue.links.map(serializeIssueLink);
  }

  if (issue.extensions !== undefined) {
    frontmatter.extensions = issue.extensions;
  }

  return frontmatter;
}

export function serializeIssueMarkdown(
  issue: Issue,
  options: SerializeIssueMarkdownOptions = {},
): string {
  const frontmatterSource = stringifyYaml(
    buildIssueFrontmatterRecord(issue, options),
  ).trimEnd();

  if (issue.body === undefined || issue.body.length === 0) {
    return `---
${frontmatterSource}
---
`;
  }

  return `---
${frontmatterSource}
---

${issue.body}`;
}
