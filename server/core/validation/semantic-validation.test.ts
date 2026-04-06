import { expect, test } from "bun:test";

import type { Issue } from "../types/index.ts";
import {
  assertValidIssueSemantics,
  IssueSemanticValidationError,
  validateIssueSemantics,
} from "./index.ts";

const BASE_ISSUE_FIELDS = {
  spec_version: "mis/0.1",
  kind: "task",
  created_at: "2026-03-22T10:24:00-05:00",
} as const;

function captureSemanticValidationError(issue: Issue): IssueSemanticValidationError {
  try {
    assertValidIssueSemantics(issue);
  } catch (error) {
    expect(error).toBeInstanceOf(IssueSemanticValidationError);
    return error as IssueSemanticValidationError;
  }

  throw new Error("Expected assertValidIssueSemantics to throw.");
}

test("validateIssueSemantics accepts a canonical duplicate issue", () => {
  const issue = {
    ...BASE_ISSUE_FIELDS,
    id: "ISSUE-0011",
    title: "Consolidate duplicate indexing proposal",
    status: "canceled",
    resolution: "duplicate",
    links: [
      {
        rel: "duplicate_of",
        target: { id: "ISSUE-0007" },
      },
    ],
  } satisfies Issue;

  expect(validateIssueSemantics(issue)).toEqual([]);
});

test("validateIssueSemantics does not hard-reject duplicate semantics that are only SHOULD-level in the spec", () => {
  const issue = {
    ...BASE_ISSUE_FIELDS,
    id: "ISSUE-0012",
    title: "Duplicate semantics remain policy-dependent",
    status: "accepted",
    links: [
      {
        rel: "duplicate_of",
        target: { id: "ISSUE-0007" },
      },
    ],
  } satisfies Issue;

  expect(validateIssueSemantics(issue)).toEqual([]);
});

test("validateIssueSemantics rejects self-links", () => {
  const issue = {
    ...BASE_ISSUE_FIELDS,
    id: "ISSUE-0001",
    title: "Issue must not reference itself",
    status: "accepted",
    links: [
      {
        rel: "references",
        target: { id: "ISSUE-0001" },
      },
    ],
  } satisfies Issue;

  expect(validateIssueSemantics(issue)).toEqual([
    {
      code: "semantic.self_link",
      source: "semantic",
      path: "/links/0/target/id",
      message: "Issue links must not target the source issue itself.",
      details: {
        issueId: "ISSUE-0001",
        rel: "references",
        targetIssueId: "ISSUE-0001",
      },
      related_issue_ids: ["ISSUE-0001"],
    },
  ]);
});

test("IssueSemanticValidationError retains deterministic structured errors", () => {
  const issue = {
    ...BASE_ISSUE_FIELDS,
    id: "ISSUE-0013",
    title: "Surface semantic validation details",
    status: "accepted",
    links: [
      {
        rel: "duplicate_of",
        target: { id: "ISSUE-0013" },
      },
    ],
  } satisfies Issue;

  const error = captureSemanticValidationError(issue);

  expect(error.errors).toEqual([
    {
      code: "semantic.self_link",
      source: "semantic",
      path: "/links/0/target/id",
      message: "Issue links must not target the source issue itself.",
      details: {
        issueId: "ISSUE-0013",
        rel: "duplicate_of",
        targetIssueId: "ISSUE-0013",
      },
      related_issue_ids: ["ISSUE-0013"],
    },
  ]);
  expect(error.message).toBe(
    "Issue links must not target the source issue itself.",
  );
});
