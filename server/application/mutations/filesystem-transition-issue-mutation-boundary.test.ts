import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Issue } from "../../core/types/index.ts";
import { computeIssueRevision } from "../../store/issue-revision.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import type { TransitionIssueMutationCommand } from "./issue-mutation-boundary.ts";
import { createFilesystemTransitionIssueMutationBoundary } from "./filesystem-transition-issue-mutation-boundary.ts";
import { TransitionIssueValidationError } from "./transition-issue-validation-error.ts";

const TRANSITION_TIMESTAMP = "2026-04-16T22:30:00-05:00";

const TRANSITION_ISSUE_COMMAND = {
  kind: "transition_issue",
  issueId: "ISSUE-1234",
  input: {
    expectedRevision: "replace-me",
    to_status: "in_progress",
  },
} as const satisfies TransitionIssueMutationCommand;

const EXISTING_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: TRANSITION_ISSUE_COMMAND.issueId,
  title: "Implement transition issue mutation",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-16T09:45:00-05:00",
  updated_at: "2026-04-16T09:45:00-05:00",
  body: "## Objective\n\nTransition this issue through the mutation boundary.\n",
};

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-transition-boundary-"));
}

function createTransitionIssueBoundary(
  rootDirectory: string,
  options: Omit<
    Parameters<typeof createFilesystemTransitionIssueMutationBoundary>[0],
    "rootDirectory"
  > = {},
) {
  return createFilesystemTransitionIssueMutationBoundary({
    rootDirectory,
    ...options,
  });
}

async function writeCanonicalIssue(
  rootDirectory: string,
  issue: Issue = EXISTING_ISSUE,
): Promise<FilesystemIssueStore> {
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(issue);

  return store;
}

async function readIssueSource(
  rootDirectory: string,
  issueId: string,
): Promise<string> {
  const store = new FilesystemIssueStore({ rootDirectory });

  return readFile(store.getIssueFilePath(issueId), "utf8");
}

async function readIssueRevision(
  rootDirectory: string,
  issueId: string,
): Promise<string> {
  return computeIssueRevision(await readIssueSource(rootDirectory, issueId));
}

async function expectAppliedTransition(
  run: Promise<
    Awaited<
      ReturnType<ReturnType<typeof createTransitionIssueBoundary>["transitionIssue"]>
    >
  >,
) {
  const result = await run;

  expect(result.status).toBe("applied");
  if (result.status !== "applied") {
    throw new Error("Expected transition mutation to apply.");
  }

  return result;
}

async function expectTransitionValidationError(
  run: Promise<unknown>,
): Promise<TransitionIssueValidationError> {
  try {
    await run;
  } catch (error) {
    expect(error).toBeInstanceOf(TransitionIssueValidationError);

    return error as TransitionIssueValidationError;
  }

  throw new Error(
    "Expected transition mutation to reject with TransitionIssueValidationError.",
  );
}

test("createFilesystemTransitionIssueMutationBoundary applies valid transitions and persists the canonical issue", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);

  const result = await expectAppliedTransition(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "in_progress",
      },
    }),
  );

  expect(result).toMatchObject({
    issue: {
      ...EXISTING_ISSUE,
      status: "in_progress",
      updated_at: TRANSITION_TIMESTAMP,
    },
    envelope: {
      derived: {
        children_ids: [],
        blocks_ids: [],
        blocked_by_ids: [],
        duplicates_ids: [],
        ready: true,
        is_blocked: false,
      },
      revision: expect.any(String),
      source: {
        file_path: `vault/issues/${EXISTING_ISSUE.id}.md`,
        indexed_at: TRANSITION_TIMESTAMP,
      },
    },
    revision: expect.any(String),
  });
  expect(await store.readIssue(EXISTING_ISSUE.id)).toEqual(result.issue);
});

test("createFilesystemTransitionIssueMutationBoundary defaults completed transitions to resolution done", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory, {
    ...EXISTING_ISSUE,
    status: "in_progress",
  });
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);

  const result = await expectAppliedTransition(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "completed",
      },
    }),
  );

  expect(result.issue).toEqual({
    ...EXISTING_ISSUE,
    status: "completed",
    resolution: "done",
    updated_at: TRANSITION_TIMESTAMP,
  });
  expect(await store.readIssue(EXISTING_ISSUE.id)).toEqual(result.issue);
});

test("createFilesystemTransitionIssueMutationBoundary returns revision mismatches without modifying the canonical file", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);
  const result = await boundary.transitionIssue({
    ...TRANSITION_ISSUE_COMMAND,
    input: {
      expectedRevision: "stale-revision",
      to_status: "in_progress",
    },
  });

  expect(result).toEqual({
    status: "revision_mismatch",
    issueId: EXISTING_ISSUE.id,
    expectedRevision: "stale-revision",
    currentRevision: computeIssueRevision(originalSource),
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createFilesystemTransitionIssueMutationBoundary rejects lifecycle guard failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);
  const error = await expectTransitionValidationError(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "completed",
      },
    }),
  );

  expect(error.errors).toEqual([
    {
      code: "transition.completed_requires_in_progress",
      source: "transition_guard",
      path: "/status",
      message:
        "Issue must enter `in_progress` before it can transition to `completed`.",
      details: {
        issueId: EXISTING_ISSUE.id,
        currentStatus: "accepted",
        nextStatus: "completed",
      },
      related_issue_ids: [EXISTING_ISSUE.id],
    },
  ]);
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createFilesystemTransitionIssueMutationBoundary rejects transitions when a dependency file cannot be validated", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory, {
    ...EXISTING_ISSUE,
    links: [
      {
        rel: "depends_on",
        target: {
          id: "ISSUE-0002",
        },
        required_before: "in_progress",
      },
    ],
  });

  await store.writeIssue({
    spec_version: "mis/0.1",
    id: "ISSUE-0002",
    title: "Dependency with broken frontmatter",
    kind: "task",
    status: "completed",
    resolution: "done",
    created_at: "2026-04-16T10:00:00-05:00",
    body: "## Objective\n\nBe valid before corruption.\n",
  });

  const dependencyFilePath = store.getIssueFilePath("ISSUE-0002");
  await writeFile(
    dependencyFilePath,
    `---
spec_version: mis/0.1
id: ISSUE-0002
title: Broken dependency
kind: task
status: accepted
created_at: [unterminated
---
`,
  );

  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);
  const error = await expectTransitionValidationError(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "in_progress",
      },
    }),
  );

  expect(error.errors).toMatchObject([
    {
      code: "transition.dependency_issue_invalid",
      source: "canonical",
      path: "/links/0/target/id",
      details: {
        dependencyIssueId: "ISSUE-0002",
        filePath: "vault/issues/ISSUE-0002.md",
      },
    },
  ]);
  expect(error.errors[0]?.message).toContain("Failed to parse YAML frontmatter:");
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});
