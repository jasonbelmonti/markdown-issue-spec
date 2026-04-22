import { expect, test } from "bun:test";
import { mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Issue, IssueEnvelope } from "../../core/types/index.ts";
import { indexIssueEnvelope, openProjectionDatabase } from "../../projection/index.ts";
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

async function indexProjectedIssue(
  rootDirectory: string,
  issue: Issue,
  filePath: string,
): Promise<void> {
  const database = openProjectionDatabase(join(rootDirectory, ".mis", "index.sqlite"));

  try {
    indexIssueEnvelope(database, createEnvelope(issue, filePath));
  } finally {
    database.close();
  }
}

async function writeCanonicalIssue(
  rootDirectory: string,
  issue: Issue = EXISTING_ISSUE,
): Promise<FilesystemIssueStore> {
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(issue);
  await indexProjectedIssue(rootDirectory, issue, `vault/issues/${issue.id}.md`);

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

function createEnvelope(issue: Issue, filePath: string): IssueEnvelope {
  return {
    issue,
    revision: `rev-${issue.id.toLowerCase()}`,
    source: {
      file_path: filePath,
      indexed_at: TRANSITION_TIMESTAMP,
    },
    derived: {
      children_ids: [],
      blocks_ids: [],
      blocked_by_ids: [],
      duplicates_ids: [],
      ready: true,
      is_blocked: false,
    },
  };
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

test("createFilesystemTransitionIssueMutationBoundary rejects reopening terminal issues without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory, {
    ...EXISTING_ISSUE,
    status: "completed",
    resolution: "done",
  });
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);
  const error = await expectTransitionValidationError(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "accepted",
      },
    }),
  );

  expect(error.errors).toEqual([
    {
      code: "transition.terminal_issue_closed",
      source: "transition_guard",
      path: "/status",
      message:
        "Issue is already terminal with status `completed` and cannot transition to `accepted`.",
      details: {
        issueId: EXISTING_ISSUE.id,
        currentStatus: "completed",
        nextStatus: "accepted",
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
  await indexProjectedIssue(rootDirectory, {
    spec_version: "mis/0.1",
    id: "ISSUE-0002",
    title: "Dependency with broken frontmatter",
    kind: "task",
    status: "completed",
    resolution: "done",
    created_at: "2026-04-16T10:00:00-05:00",
    body: "## Objective\n\nBe valid before corruption.\n",
  }, "vault/issues/ISSUE-0002.md");

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

test("createFilesystemTransitionIssueMutationBoundary rejects transitions when a dependency id is unsafe", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory, {
    ...EXISTING_ISSUE,
    links: [
      {
        rel: "depends_on",
        target: {
          id: "../ISSUE-0002",
        },
        required_before: "in_progress",
      },
    ],
  });

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

  expect(error.errors).toEqual([
    {
      code: "transition.dependency_issue_invalid",
      source: "canonical",
      path: "/links/0/target/id",
      message:
        'Issue id "../ISSUE-0002" cannot contain path separators when building filesystem paths.',
      details: {
        dependencyIssueId: "../ISSUE-0002",
      },
    },
  ]);
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createFilesystemTransitionIssueMutationBoundary skips dependency validation for canceled transitions", async () => {
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
    status: "accepted",
    created_at: "2026-04-16T10:00:00-05:00",
    body: "## Objective\n\nBe valid before corruption.\n",
  });

  await writeFile(
    store.getIssueFilePath("ISSUE-0002"),
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
  const result = await expectAppliedTransition(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "canceled",
        resolution: "obsolete",
      },
    }),
  );

  expect(result.issue).toEqual({
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
    status: "canceled",
    resolution: "obsolete",
    updated_at: TRANSITION_TIMESTAMP,
  });
  expect(await store.readIssue(EXISTING_ISSUE.id)).toEqual(result.issue);
});

test("createFilesystemTransitionIssueMutationBoundary returns revision mismatches before dependency validation", async () => {
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

  await writeFile(
    store.getIssueFilePath("ISSUE-0002"),
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

test("createFilesystemTransitionIssueMutationBoundary restores the canonical file when post-persist rebuild fails", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
    afterPersist: async () => {
      throw new Error("projection rebuild failed");
    },
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  await expect(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "in_progress",
      },
    }),
  ).rejects.toThrow("projection rebuild failed");
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createFilesystemTransitionIssueMutationBoundary ignores completed-only dependency validation when transitioning to in_progress", async () => {
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
        required_before: "completed",
      },
    ],
  });

  await store.writeIssue({
    spec_version: "mis/0.1",
    id: "ISSUE-0002",
    title: "Completed-only dependency with broken frontmatter",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-16T10:00:00-05:00",
    body: "## Objective\n\nBe valid before corruption.\n",
  });

  await writeFile(
    store.getIssueFilePath("ISSUE-0002"),
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
  const result = await expectAppliedTransition(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "in_progress",
      },
    }),
  );

  expect(result.issue).toEqual({
    ...EXISTING_ISSUE,
    links: [
      {
        rel: "depends_on",
        target: {
          id: "ISSUE-0002",
        },
        required_before: "completed",
      },
    ],
    status: "in_progress",
    updated_at: TRANSITION_TIMESTAMP,
  });
  expect(await store.readIssue(EXISTING_ISSUE.id)).toEqual(result.issue);
});

test("createFilesystemTransitionIssueMutationBoundary ignores in-progress-only dependency validation when transitioning from in_progress to completed", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory, {
    ...EXISTING_ISSUE,
    status: "in_progress",
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
    title: "In-progress-only dependency with broken frontmatter",
    kind: "task",
    status: "completed",
    resolution: "done",
    created_at: "2026-04-16T10:00:00-05:00",
    body: "## Objective\n\nBe valid before corruption.\n",
  });

  await writeFile(
    store.getIssueFilePath("ISSUE-0002"),
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
    links: [
      {
        rel: "depends_on",
        target: {
          id: "ISSUE-0002",
        },
        required_before: "in_progress",
      },
    ],
    updated_at: TRANSITION_TIMESTAMP,
  });
  expect(await store.readIssue(EXISTING_ISSUE.id)).toEqual(result.issue);
});

test("createFilesystemTransitionIssueMutationBoundary resolves renamed dependency files through projection", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const links = [
    {
      rel: "depends_on" as const,
      target: {
        id: "ISSUE-0002",
      },
      required_before: "in_progress" as const,
    },
  ];
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory, {
    ...EXISTING_ISSUE,
    links,
  });
  const dependencyIssue: Issue = {
    spec_version: "mis/0.1",
    id: "ISSUE-0002",
    title: "Renamed dependency",
    kind: "task",
    status: "completed",
    resolution: "done",
    created_at: "2026-04-16T10:00:00-05:00",
    body: "## Objective\n\nBe found through the resolver.\n",
  };

  await store.writeIssue(dependencyIssue);
  const dependencyCanonicalFilePath = store.getIssueFilePath(dependencyIssue.id);
  const dependencyRenamedFilePath = join(
    rootDirectory,
    "vault",
    "issues",
    "dependency-renamed.md",
  );
  await rename(dependencyCanonicalFilePath, dependencyRenamedFilePath);
  await indexProjectedIssue(
    rootDirectory,
    {
      ...EXISTING_ISSUE,
      links,
    },
    `vault/issues/${EXISTING_ISSUE.id}.md`,
  );
  await indexProjectedIssue(
    rootDirectory,
    dependencyIssue,
    "vault/issues/dependency-renamed.md",
  );

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

  expect(result.issue).toMatchObject({
    ...EXISTING_ISSUE,
    links,
    status: "in_progress",
    updated_at: TRANSITION_TIMESTAMP,
  });
});

test("createFilesystemTransitionIssueMutationBoundary rejects dependencies that are no longer in the accepted issue set", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const links = [
    {
      rel: "depends_on" as const,
      target: {
        id: "ISSUE-0002",
      },
      required_before: "in_progress" as const,
    },
  ];
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory, {
    ...EXISTING_ISSUE,
    links,
  });
  const dependencyIssue: Issue = {
    spec_version: "mis/0.1",
    id: "ISSUE-0002",
    title: "Dependency before duplicate drift",
    kind: "task",
    status: "completed",
    resolution: "done",
    created_at: "2026-04-16T10:00:00-05:00",
    body: "## Objective\n\nInitially valid dependency.\n",
  };

  await store.writeIssue(dependencyIssue);
  await indexProjectedIssue(
    rootDirectory,
    dependencyIssue,
    "vault/issues/ISSUE-0002.md",
  );
  await store.writeIssueAtPath(
    {
      ...dependencyIssue,
      title: "Duplicate dependency copy",
    },
    join(rootDirectory, "vault", "issues", "duplicate-dependency.md"),
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

  expect(error.errors).toEqual([
    {
      code: "transition.dependency_issue_invalid",
      source: "canonical",
      path: "/links/0/target/id",
      message:
        "Dependency issue ISSUE-0002 is not part of the accepted canonical issue set.",
      details: {
        dependencyIssueId: "ISSUE-0002",
        filePath: "vault/issues/ISSUE-0002.md",
      },
    },
  ]);
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createFilesystemTransitionIssueMutationBoundary keeps renamed related issues in derived envelopes", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  await writeCanonicalIssue(rootDirectory);
  const store = new FilesystemIssueStore({ rootDirectory });
  const childIssue: Issue = {
    spec_version: "mis/0.1",
    id: "ISSUE-0002",
    title: "Renamed child issue",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-16T10:00:00-05:00",
    links: [
      {
        rel: "parent",
        target: {
          id: EXISTING_ISSUE.id,
        },
      },
    ],
    body: "## Objective\n\nStay visible in derived fields.\n",
  };

  await store.writeIssue(childIssue);
  await rename(
    store.getIssueFilePath(childIssue.id),
    join(rootDirectory, "vault", "issues", "child-renamed.md"),
  );

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

  expect(result.envelope.derived.children_ids).toEqual([childIssue.id]);
});

test("createFilesystemTransitionIssueMutationBoundary rejects targets that are no longer in the accepted issue set", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory);

  await store.writeIssueAtPath(
    {
      ...EXISTING_ISSUE,
      title: "Duplicate target issue copy",
    },
    join(rootDirectory, "vault", "issues", "duplicate.md"),
  );

  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const error = await expectTransitionValidationError(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      input: {
        expectedRevision,
        to_status: "in_progress",
      },
    }),
  );

  expect(error.errors).toEqual([
    expect.objectContaining({
      code: "transition.target_issue_invalid",
      path: `vault/issues/${EXISTING_ISSUE.id}.md`,
      source: "canonical",
      details: {
        issueId: EXISTING_ISSUE.id,
        filePath: `vault/issues/${EXISTING_ISSUE.id}.md`,
      },
    }),
  ]);
});

test("createFilesystemTransitionIssueMutationBoundary rejects unsafe issue ids as request validation errors", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createTransitionIssueBoundary(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });

  const error = await expectTransitionValidationError(
    boundary.transitionIssue({
      ...TRANSITION_ISSUE_COMMAND,
      issueId: "../ISSUE-1234",
      input: {
        expectedRevision: "stale-revision",
        to_status: "in_progress",
      },
    }),
  );

  expect(error.errors).toEqual([
    expect.objectContaining({
      code: "transition.invalid_issue_id",
      path: "/id",
      source: "request",
      details: {
        issueId: "../ISSUE-1234",
      },
    }),
  ]);
});
