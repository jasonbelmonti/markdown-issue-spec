import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  parseIssueMarkdown,
  parseIssueMarkdownFile,
  parseMarkdownFrontmatterDocument,
} from "./index.ts";

const BASIC_ISSUE_FILE_PATH = fileURLToPath(
  new URL("../../../docs/examples/basic-issue.md", import.meta.url),
);
const DEPENDENCY_ISSUE_FILE_PATH = fileURLToPath(
  new URL("../../../docs/examples/dependency-issue.md", import.meta.url),
);
const DUPLICATE_ISSUE_FILE_PATH = fileURLToPath(
  new URL("../../../docs/examples/duplicate-issue.md", import.meta.url),
);

const BASIC_ISSUE_BODY = `## Objective

Define a first-pass issue tracking spec that is Markdown-compatible without
making Markdown itself the core abstraction.

## Context

The spec needs to work as the basis for a future Obsidian plugin.

## Constraints

The concepts should not depend on any one editor, database, or UI layer.

## Materially verifiable success criteria

- [ ] The core issue model is defined.
- [ ] Relationship semantics are defined.
- [ ] A Markdown serialization profile exists.

## Notes

Prefer normalized links over many top-level relationship fields.
`;

const DUPLICATE_ISSUE_BODY = `## Objective

Record that this issue should not proceed independently because an equivalent
issue already exists.

## Context

The canonical work continues on \`ISSUE-0007\`.

## Constraints

This document exists to preserve history and linkage without creating a second
source of truth.

## Materially verifiable success criteria

- [ ] The issue is terminal.
- [ ] The issue declares \`resolution: duplicate\`.
- [ ] The issue points at the canonical issue via \`duplicate_of\`.

## Notes

If other issues depend on this work item, they should be retargeted to the
canonical issue rather than waiting on a canceled duplicate.
`;

test("parseIssueMarkdownFile parses the basic example into the canonical issue shape", async () => {
  const issue = await parseIssueMarkdownFile(BASIC_ISSUE_FILE_PATH);

  expect(issue).toEqual({
    spec_version: "mis/0.1",
    id: "ISSUE-0001",
    title: "Draft the first markdown issue tracking spec",
    kind: "task",
    status: "proposed",
    created_at: "2026-03-22T10:24:00-05:00",
    updated_at: "2026-03-22T10:24:00-05:00",
    priority: "high",
    labels: ["spec", "core"],
    links: [
      {
        rel: "references",
        target: { id: "ISSUE-0009" },
        note: "Background research issue on agent-first workflows",
      },
    ],
    extensions: {
      "acme/story_points": 3,
    },
    body: BASIC_ISSUE_BODY,
  });
});

test("parseIssueMarkdown preserves link order and normalizes shorthand and object targets", async () => {
  const issue = parseIssueMarkdown(
    await Bun.file(DEPENDENCY_ISSUE_FILE_PATH).text(),
  );

  expect(issue.links?.map((link) => link.rel)).toEqual([
    "parent",
    "depends_on",
    "depends_on",
    "related_to",
  ]);
  expect(issue.links?.[0]?.target).toEqual({
    id: "EPIC-0001",
    href: "../epics/EPIC-0001.md",
  });
  expect(issue.links?.[1]).toEqual({
    rel: "depends_on",
    target: {
      id: "ISSUE-0002",
      href: "./ISSUE-0002.md",
    },
    required_before: "in_progress",
    note: "ID semantics should be stable before the profile is finalized",
  });
  expect(issue.links?.[2]).toEqual({
    rel: "depends_on",
    target: { id: "ISSUE-0004" },
    required_before: "completed",
    note: "Wait for example corpus review before declaring the profile complete",
  });
  expect(issue.links?.[3]).toEqual({
    rel: "related_to",
    target: { id: "ISSUE-0012" },
    note: "Relates to the indexing strategy work item",
  });
});

test("parseIssueMarkdown preserves terminal issue records from Markdown examples", async () => {
  const issue = parseIssueMarkdown(
    await Bun.file(DUPLICATE_ISSUE_FILE_PATH).text(),
  );

  expect(issue).toEqual({
    spec_version: "mis/0.1",
    id: "ISSUE-0011",
    title: "Consolidate duplicate indexing proposal",
    kind: "task",
    status: "canceled",
    resolution: "duplicate",
    created_at: "2026-03-22T10:24:00-05:00",
    updated_at: "2026-03-22T10:24:00-05:00",
    labels: ["spec", "duplicate"],
    links: [
      {
        rel: "duplicate_of",
        target: { id: "ISSUE-0007" },
        note: "Canonical profile work continues on the primary issue",
      },
    ],
    body: DUPLICATE_ISSUE_BODY,
  });
});

test("parseIssueMarkdown reads canonical body from the Markdown document body", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0099
title: Prefer the actual Markdown body
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
body: this key is profile-invalid and should not become canonical body
---

## Objective

The document body wins.
`;

  const rawDocument = parseMarkdownFrontmatterDocument(source);
  const issue = parseIssueMarkdown(source);

  expect(rawDocument.frontmatter.body).toBe(
    "this key is profile-invalid and should not become canonical body",
  );
  expect(issue.body).toBe(`## Objective

The document body wins.
`);
});

test("parseIssueMarkdown preserves verbose target locator hints", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0100
title: Preserve locator hints
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: references
    target:
      id: ISSUE-0002
      href: ../issues/ISSUE-0002.md
      path: vault/issues/ISSUE-0002.md
      title: Existing issue
---

## Objective

Keep locator hints attached to the normalized IssueRef.
`;

  const issue = parseIssueMarkdown(source);

  expect(issue.links).toEqual([
    {
      rel: "references",
      target: {
        id: "ISSUE-0002",
        href: "../issues/ISSUE-0002.md",
        path: "vault/issues/ISSUE-0002.md",
        title: "Existing issue",
      },
    },
  ]);
});

test("parseIssueMarkdown preserves custom relations and link extensions", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0101
title: Preserve custom relation metadata
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: plugin.example/reviewed_by
    target:
      id: ISSUE-0012
      title: Indexing strategy work item
    note: Custom relation types remain valid when namespaced
    extensions:
      acme/gate: schema-stability
---

## Objective

Retain namespaced relation data.
`;

  const issue = parseIssueMarkdown(source);

  expect(issue.links).toHaveLength(1);
  expect(String(issue.links?.[0]?.rel)).toBe("plugin.example/reviewed_by");
  expect(issue.links?.[0]?.target).toEqual({
    id: "ISSUE-0012",
    title: "Indexing strategy work item",
  });
  expect(issue.links?.[0]?.note).toBe(
    "Custom relation types remain valid when namespaced",
  );
  expect(issue.links?.[0]?.extensions).toEqual({
    "acme/gate": "schema-stability",
  });
});
