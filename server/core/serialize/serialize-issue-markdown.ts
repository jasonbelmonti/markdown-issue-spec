import { stringify as stringifyYaml } from "yaml";

import type { Issue } from "../types/index.ts";
import { resolveSerializedUpdatedAt } from "./resolve-serialized-updated-at.ts";
import { serializeIssueLink } from "./serialize-issue-link.ts";
import type { SerializeIssueMarkdownOptions } from "./types.ts";

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
