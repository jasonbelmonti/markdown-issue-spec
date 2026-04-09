import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Issue } from "../core/types/index.ts";
import { atomicWriteFile, FilesystemIssueStore, getIssueFilePath } from "./index.ts";

const BASE_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: "ISSUE-0200",
  title: "Persist canonical issues through the filesystem store",
  kind: "task",
  status: "proposed",
  created_at: "2026-04-07T10:00:00-05:00",
  updated_at: "2026-04-07T10:00:00-05:00",
  labels: ["store", "filesystem"],
  links: [
    {
      rel: "references",
      target: { id: "ISSUE-0001" },
    },
  ],
  extensions: {
    "acme/example": true,
  },
  body: `## Objective

Write and read canonical issue documents through the filesystem store.
`,
};

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-store-"));
}

test("getIssueFilePath derives vault/issues/<id>.md from the issue id", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  expect(getIssueFilePath(rootDirectory, "ISSUE-0200")).toBe(
    join(rootDirectory, "vault", "issues", "ISSUE-0200.md"),
  );
});

test("getIssueFilePath rejects traversal segments in issue ids", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  expect(() => getIssueFilePath(rootDirectory, "../ISSUE-0200")).toThrow(
    'Issue id "../ISSUE-0200" cannot contain path separators when building filesystem paths.',
  );
  expect(() => getIssueFilePath(rootDirectory, "..")).toThrow(
    'Issue id ".." cannot be "." or ".." when building filesystem paths.',
  );
});

test("atomicWriteFile creates parent directories and leaves only the target file behind", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const issueDirectory = join(rootDirectory, "vault", "issues");
  const filePath = join(issueDirectory, "ISSUE-0200.md");

  await atomicWriteFile(filePath, "first");

  expect(await readFile(filePath, "utf8")).toBe("first");
  expect(await readdir(issueDirectory)).toEqual(["ISSUE-0200.md"]);
});

test("FilesystemIssueStore writes and reads canonical issues at vault/issues/<id>.md", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });

  const filePath = await store.writeIssue(BASE_ISSUE);

  expect(filePath).toBe(join(rootDirectory, "vault", "issues", "ISSUE-0200.md"));
  expect(await store.readIssue("ISSUE-0200")).toEqual(BASE_ISSUE);
});

test("FilesystemIssueStore rejects files whose stored id does not match the requested id", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(BASE_ISSUE);

  const filePath = store.getIssueFilePath(BASE_ISSUE.id);
  const tamperedContent = (await readFile(filePath, "utf8")).replace(
    "id: ISSUE-0200",
    "id: ISSUE-0999",
  );

  await atomicWriteFile(filePath, tamperedContent);

  await expect(store.readIssue("ISSUE-0200")).rejects.toThrow(
    'Issue file for "ISSUE-0200" contained mismatched frontmatter id "ISSUE-0999".',
  );
});

test("FilesystemIssueStore rejects unsafe issue ids before reading or writing", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });
  const unsafeIssue: Issue = {
    ...BASE_ISSUE,
    id: "../../escape",
  };

  await expect(store.writeIssue(unsafeIssue)).rejects.toThrow(
    'Issue id "../../escape" cannot contain path separators when building filesystem paths.',
  );
  await expect(store.readIssue("../../escape")).rejects.toThrow(
    'Issue id "../../escape" cannot contain path separators when building filesystem paths.',
  );
});

test("FilesystemIssueStore forwards serializer updated_at mutation policy during writes", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });
  const timestamp = "2026-04-07T11:30:00-05:00";
  const issueWithoutUpdatedAt: Issue = {
    ...BASE_ISSUE,
    id: "ISSUE-0201",
    updated_at: undefined,
  };

  await store.writeIssue(issueWithoutUpdatedAt, {
    updatedAt: {
      mode: "canonical_mutation",
      timestamp,
    },
  });

  expect(await store.readIssue("ISSUE-0201")).toEqual({
    ...issueWithoutUpdatedAt,
    updated_at: timestamp,
  });
});
