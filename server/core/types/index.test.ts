import { expect, test } from "bun:test";

import {
  CORE_ISSUE_RELATIONS,
  isCoreIssueRelation,
  type DependencyIssueLink,
  type Issue,
  type IssueEnvelope,
  type ValidationError,
} from "./index.ts";

const dependencyTargetId = "ISSUE-0001";
const issueId = "ISSUE-0002";
const childIssueId = "ISSUE-0003";
const issuePath = `vault/issues/${issueId}.md`;

const dependencyLink = {
  rel: "depends_on",
  target: {
    id: dependencyTargetId,
    title: "Land the parser",
  },
  required_before: "completed",
  note: "Type validation depends on parse output.",
} satisfies DependencyIssueLink;

const issue = {
  spec_version: "mis/0.1",
  id: issueId,
  title: "Define shared validation types",
  kind: "task",
  status: "completed",
  resolution: "done",
  created_at: "2026-03-26T12:00:00Z",
  updated_at: "2026-03-27T08:30:00Z",
  summary: "Shared type surface for validation and indexing.",
  body: "## Objective\n\nStabilize the shared envelope and error model.",
  priority: "high",
  labels: ["types", "core"],
  assignees: ["jason"],
  links: [dependencyLink],
  extensions: {
    "mis/source": "agent-first-mvp",
  },
} satisfies Issue;

const derived = {
  children_ids: [childIssueId],
  blocks_ids: [],
  blocked_by_ids: [dependencyTargetId],
  duplicates_ids: [],
  ready: false,
  is_blocked: true,
} satisfies IssueEnvelope["derived"];

const source = {
  file_path: issuePath,
  indexed_at: "2026-03-27T08:31:00Z",
} satisfies IssueEnvelope["source"];

const issueEnvelope = {
  issue,
  derived,
  revision: "content-hash",
  source,
} satisfies IssueEnvelope;

const validationError = {
  code: "parent_cycle",
  severity: "error",
  message: "Parent graph contains a cycle.",
  issue_id: issueId,
  file_path: issuePath,
  field_path: "links[0].target",
  related_issue_ids: [childIssueId],
} satisfies ValidationError;

test("shared type examples stay aligned with runtime helpers", () => {
  expect(CORE_ISSUE_RELATIONS).toContain("depends_on");
  expect(isCoreIssueRelation(dependencyLink.rel)).toBe(true);
  expect(issueEnvelope.derived.ready).toBe(false);
  expect(issueEnvelope.source.file_path).toBe(issuePath);
  expect(validationError.severity).toBe("error");
});
