import { expect, test } from "bun:test";

import type {
  DependencyRequiredBefore,
  Issue,
  IssueLink,
} from "../types/index.ts";
import { evaluateIssueTransitionGuard } from "./index.ts";

const BASE_ISSUE_FIELDS = {
  spec_version: "mis/0.1",
  kind: "task",
  created_at: "2026-03-22T10:24:00-05:00",
} as const;

function createIssue<TIssue extends Issue>(
  overrides: Omit<TIssue, keyof typeof BASE_ISSUE_FIELDS>,
): TIssue {
  return {
    ...BASE_ISSUE_FIELDS,
    ...overrides,
  } as TIssue;
}

function createDependencyLink(
  targetId: string,
  requiredBefore: DependencyRequiredBefore,
): IssueLink {
  return {
    rel: "depends_on",
    required_before: requiredBefore,
    target: { id: targetId },
  };
}

test("evaluateIssueTransitionGuard allows in_progress when required dependencies are satisfied", () => {
  const issue = createIssue({
    id: "ISSUE-0001",
    title: "Start guarded work",
    status: "accepted",
    links: [createDependencyLink("ISSUE-0002", "in_progress")],
  });

  const dependencyIssue = createIssue({
    id: "ISSUE-0002",
    title: "Dependency is finished",
    status: "completed",
    resolution: "done",
  });

  expect(
    evaluateIssueTransitionGuard({
      issue,
      next_status: "in_progress",
      known_dependency_issues: [dependencyIssue],
    }),
  ).toEqual({
    ok: true,
    errors: [],
  });
});

test("evaluateIssueTransitionGuard blocks in_progress when a required dependency is unsatisfied", () => {
  const issue = createIssue({
    id: "ISSUE-0003",
    title: "Work must wait on dependency",
    status: "accepted",
    links: [createDependencyLink("ISSUE-0004", "in_progress")],
  });

  const dependencyIssue = createIssue({
    id: "ISSUE-0004",
    title: "Dependency is still active",
    status: "accepted",
  });

  expect(
    evaluateIssueTransitionGuard({
      issue,
      next_status: "in_progress",
      known_dependency_issues: [dependencyIssue],
    }),
  ).toEqual({
    ok: false,
    errors: [
      {
        code: "transition.dependency_not_satisfied",
        source: "transition_guard",
        path: "/links/0/target/id",
        message:
          "Dependency issue ISSUE-0004 must be `completed` with resolution `done` before this issue can transition to `in_progress`.",
        details: {
          issueId: "ISSUE-0003",
          currentStatus: "accepted",
          nextStatus: "in_progress",
          dependencyIssueId: "ISSUE-0004",
          dependencyStatus: "accepted",
          dependencyResolution: null,
          dependencyRequiredBefore: "in_progress",
        },
        related_issue_ids: ["ISSUE-0003", "ISSUE-0004"],
      },
    ],
  });
});

test("evaluateIssueTransitionGuard allows completed when the issue is already in_progress and completed dependencies are satisfied", () => {
  const issue = createIssue({
    id: "ISSUE-0005",
    title: "Close guarded work",
    status: "in_progress",
    links: [createDependencyLink("ISSUE-0006", "completed")],
  });

  const dependencyIssue = createIssue({
    id: "ISSUE-0006",
    title: "Dependency is done",
    status: "completed",
    resolution: "done",
  });

  expect(
    evaluateIssueTransitionGuard({
      issue,
      next_status: "completed",
      known_dependency_issues: [dependencyIssue],
    }),
  ).toEqual({
    ok: true,
    errors: [],
  });
});

test("evaluateIssueTransitionGuard blocks completed when a completed dependency is unsatisfied", () => {
  const issue = createIssue({
    id: "ISSUE-0007",
    title: "Do not close before dependency is done",
    status: "in_progress",
    links: [createDependencyLink("ISSUE-0008", "completed")],
  });

  const dependencyIssue = createIssue({
    id: "ISSUE-0008",
    title: "Dependency was canceled",
    status: "canceled",
    resolution: "duplicate",
  });

  expect(
    evaluateIssueTransitionGuard({
      issue,
      next_status: "completed",
      known_dependency_issues: [dependencyIssue],
    }),
  ).toMatchObject({
    ok: false,
    errors: [
      {
        code: "transition.dependency_not_satisfied",
        source: "transition_guard",
        path: "/links/0/target/id",
        details: {
          issueId: "ISSUE-0007",
          currentStatus: "in_progress",
          nextStatus: "completed",
          dependencyIssueId: "ISSUE-0008",
          dependencyStatus: "canceled",
          dependencyResolution: "duplicate",
          dependencyRequiredBefore: "completed",
        },
        related_issue_ids: ["ISSUE-0007", "ISSUE-0008"],
      },
    ],
  });
});

test("evaluateIssueTransitionGuard blocks direct completion before the issue has entered in_progress", () => {
  const issue = createIssue({
    id: "ISSUE-0009",
    title: "Must not skip in_progress",
    status: "accepted",
    links: [createDependencyLink("ISSUE-0010", "in_progress")],
  });

  const dependencyIssue = createIssue({
    id: "ISSUE-0010",
    title: "Dependency is still pending",
    status: "accepted",
  });

  expect(
    evaluateIssueTransitionGuard({
      issue,
      next_status: "completed",
      known_dependency_issues: [dependencyIssue],
    }),
  ).toEqual({
    ok: false,
    errors: [
      {
        code: "transition.dependency_not_satisfied",
        source: "transition_guard",
        path: "/links/0/target/id",
        message:
          "Dependency issue ISSUE-0010 must be `completed` with resolution `done` before this issue can transition to `completed`.",
        details: {
          issueId: "ISSUE-0009",
          currentStatus: "accepted",
          nextStatus: "completed",
          dependencyIssueId: "ISSUE-0010",
          dependencyStatus: "accepted",
          dependencyResolution: null,
          dependencyRequiredBefore: "in_progress",
        },
        related_issue_ids: ["ISSUE-0009", "ISSUE-0010"],
      },
      {
        code: "transition.completed_requires_in_progress",
        source: "transition_guard",
        path: "/status",
        message:
          "Issue must enter `in_progress` before it can transition to `completed`.",
        details: {
          issueId: "ISSUE-0009",
          currentStatus: "accepted",
          nextStatus: "completed",
        },
        related_issue_ids: ["ISSUE-0009"],
      },
    ],
  });
});

test("evaluateIssueTransitionGuard blocks reopening terminal issues", () => {
  const issue = createIssue({
    id: "ISSUE-0011",
    title: "Closed work stays closed",
    status: "completed",
    resolution: "done",
  });

  expect(
    evaluateIssueTransitionGuard({
      issue,
      next_status: "accepted",
    }),
  ).toEqual({
    ok: false,
    errors: [
      {
        code: "transition.terminal_issue_closed",
        source: "transition_guard",
        path: "/status",
        message:
          "Issue is already terminal with status `completed` and cannot transition to `accepted`.",
        details: {
          issueId: "ISSUE-0011",
          currentStatus: "completed",
          nextStatus: "accepted",
        },
        related_issue_ids: ["ISSUE-0011"],
      },
    ],
  });
});
