import { expect, test } from "bun:test";

import type { Issue } from "../types/index.ts";
import {
  validateIssueGraph,
  type GraphValidationIssue,
} from "./validate-issue-graph.ts";

function createGraphValidationIssue(
  issue: Issue,
  filePath = `vault/issues/${issue.id}.md`,
): GraphValidationIssue {
  return {
    issue,
    file_path: filePath,
  };
}

function createIssue(
  issueId: string,
  links: Issue["links"] = [],
): Issue {
  return {
    spec_version: "mis/0.1",
    id: issueId,
    title: `Issue ${issueId}`,
    kind: "task",
    status: "accepted",
    created_at: "2026-04-10T12:00:00-05:00",
    links,
  };
}

test("validateIssueGraph emits deterministic unresolved-reference errors regardless of input order", () => {
  const errors = validateIssueGraph([
    createGraphValidationIssue(
      createIssue("ISSUE-0200", [
        {
          rel: "references",
          target: { id: "ISSUE-0999" },
        },
        {
          rel: "related_to",
          target: { id: "ISSUE-0300" },
        },
        {
          rel: "references",
          target: { id: "ISSUE-0998" },
        },
      ]),
    ),
    createGraphValidationIssue(createIssue("ISSUE-0300")),
    createGraphValidationIssue(
      createIssue("ISSUE-0100", [
        {
          rel: "depends_on",
          target: { id: "ISSUE-0997" },
          required_before: "completed",
        },
      ]),
    ),
  ]);

  expect(errors).toEqual([
    {
      code: "graph.unresolved_reference",
      severity: "error",
      message: "Issue references a target that was not found in the current graph.",
      issue_id: "ISSUE-0100",
      file_path: "vault/issues/ISSUE-0100.md",
      field_path: "links[0].target",
      related_issue_ids: ["ISSUE-0997"],
    },
    {
      code: "graph.unresolved_reference",
      severity: "error",
      message: "Issue references a target that was not found in the current graph.",
      issue_id: "ISSUE-0200",
      file_path: "vault/issues/ISSUE-0200.md",
      field_path: "links[0].target",
      related_issue_ids: ["ISSUE-0999"],
    },
    {
      code: "graph.unresolved_reference",
      severity: "error",
      message: "Issue references a target that was not found in the current graph.",
      issue_id: "ISSUE-0200",
      file_path: "vault/issues/ISSUE-0200.md",
      field_path: "links[2].target",
      related_issue_ids: ["ISSUE-0998"],
    },
  ]);
});

test("validateIssueGraph emits one parent-cycle error per affected issue with sorted related ids", () => {
  const errors = validateIssueGraph([
    createGraphValidationIssue(
      createIssue("ISSUE-0200", [
        {
          rel: "parent",
          target: { id: "ISSUE-0100" },
        },
      ]),
    ),
    createGraphValidationIssue(
      createIssue("ISSUE-0100", [
        {
          rel: "parent",
          target: { id: "ISSUE-0300" },
        },
      ]),
    ),
    createGraphValidationIssue(
      createIssue("ISSUE-0300", [
        {
          rel: "parent",
          target: { id: "ISSUE-0200" },
        },
      ]),
    ),
  ]);

  expect(errors).toEqual([
    {
      code: "graph.parent_cycle",
      severity: "error",
      message: "Parent graph contains a cycle.",
      issue_id: "ISSUE-0100",
      file_path: "vault/issues/ISSUE-0100.md",
      related_issue_ids: ["ISSUE-0200", "ISSUE-0300"],
    },
    {
      code: "graph.parent_cycle",
      severity: "error",
      message: "Parent graph contains a cycle.",
      issue_id: "ISSUE-0200",
      file_path: "vault/issues/ISSUE-0200.md",
      related_issue_ids: ["ISSUE-0100", "ISSUE-0300"],
    },
    {
      code: "graph.parent_cycle",
      severity: "error",
      message: "Parent graph contains a cycle.",
      issue_id: "ISSUE-0300",
      file_path: "vault/issues/ISSUE-0300.md",
      related_issue_ids: ["ISSUE-0100", "ISSUE-0200"],
    },
  ]);
});

test("validateIssueGraph emits one depends-on-cycle error per affected issue and ignores unresolved dependency edges for cycle detection", () => {
  const errors = validateIssueGraph([
    createGraphValidationIssue(
      createIssue("ISSUE-0200", [
        {
          rel: "depends_on",
          target: { id: "ISSUE-0100" },
          required_before: "completed",
        },
      ]),
    ),
    createGraphValidationIssue(
      createIssue("ISSUE-0100", [
        {
          rel: "depends_on",
          target: { id: "ISSUE-0200" },
          required_before: "in_progress",
        },
        {
          rel: "depends_on",
          target: { id: "ISSUE-0999" },
          required_before: "completed",
        },
      ]),
    ),
  ]);

  expect(errors).toEqual([
    {
      code: "graph.unresolved_reference",
      severity: "error",
      message: "Issue references a target that was not found in the current graph.",
      issue_id: "ISSUE-0100",
      file_path: "vault/issues/ISSUE-0100.md",
      field_path: "links[1].target",
      related_issue_ids: ["ISSUE-0999"],
    },
    {
      code: "graph.depends_on_cycle",
      severity: "error",
      message: "Depends-on graph contains a cycle.",
      issue_id: "ISSUE-0100",
      file_path: "vault/issues/ISSUE-0100.md",
      related_issue_ids: ["ISSUE-0200"],
    },
    {
      code: "graph.depends_on_cycle",
      severity: "error",
      message: "Depends-on graph contains a cycle.",
      issue_id: "ISSUE-0200",
      file_path: "vault/issues/ISSUE-0200.md",
      related_issue_ids: ["ISSUE-0100"],
    },
  ]);
});
