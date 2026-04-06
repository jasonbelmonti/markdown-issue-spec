import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  IssueSemanticValidationError,
  MarkdownFrontmatterValidationError,
} from "../validation/index.ts";
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
---

## Objective

The document body wins.
`;

  const issue = parseIssueMarkdown(source);

  expect(issue.body).toBe(`## Objective

The document body wins.
`);
});

test("parseIssueMarkdown rejects profile-invalid frontmatter body keys", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0104
title: Reject frontmatter body
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
body: this key is forbidden for the markdown frontmatter profile
---

## Objective

Use the Markdown body instead.
`;

  const rawDocument = parseMarkdownFrontmatterDocument(source);

  expect(rawDocument.frontmatter.body).toBe(
    "this key is forbidden for the markdown frontmatter profile",
  );
  expect(() => parseIssueMarkdown(source)).toThrow(
    "Markdown frontmatter must not declare `body`; use the Markdown document body instead.",
  );
});

test("parseIssueMarkdown rejects profile-invalid frontmatter description keys", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0105
title: Reject frontmatter description
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
description: this key is also forbidden for the markdown frontmatter profile
---

## Objective

Use the Markdown body instead.
`;

  expect(() => parseIssueMarkdown(source)).toThrow(
    "Markdown frontmatter must not declare `description`; use the Markdown document body instead.",
  );
});

test("parseIssueMarkdown surfaces structured validation errors", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0105
title: Reject multiple invalid frontmatter fields
kind: task
status: proposed
created_at: invalid-timestamp
description: this key is forbidden for the markdown frontmatter profile
priroity: high
---

## Objective

Surface structured validation details.
`;

  try {
    parseIssueMarkdown(source);
    throw new Error("Expected parseIssueMarkdown to throw.");
  } catch (error) {
    expect(error).toBeInstanceOf(MarkdownFrontmatterValidationError);

    expect((error as MarkdownFrontmatterValidationError).errors).toEqual([
      {
        code: "schema.format",
        source: "schema",
        path: "/created_at",
        message: "Expected `created_at` to be an RFC 3339 date-time string.",
        details: {
          keyword: "format",
          format: "date-time",
          schemaPath: "#/properties/created_at/format",
        },
      },
      {
        code: "profile.forbidden_frontmatter_field",
        source: "profile",
        path: "/description",
        message:
          "Markdown frontmatter must not declare `description`; use the Markdown document body instead.",
        details: {
          field: "description",
        },
      },
      {
        code: "schema.additional_properties",
        source: "schema",
        path: "/priroity",
        message: "Unexpected frontmatter field: priroity.",
        details: {
          keyword: "additionalProperties",
          property: "priroity",
          schemaPath: "#/additionalProperties",
        },
      },
    ]);
  }
});

test("parseIssueMarkdown rejects self-links after frontmatter validation passes", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0112
title: Reject semantic self-links
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: references
    target: ISSUE-0112
---

## Objective

Semantic validation should run on otherwise valid parsed issues.
`;

  try {
    parseIssueMarkdown(source);
    throw new Error("Expected parseIssueMarkdown to throw.");
  } catch (error) {
    expect(error).toBeInstanceOf(IssueSemanticValidationError);
    expect((error as IssueSemanticValidationError).errors).toEqual([
      {
        code: "semantic.self_link",
        source: "semantic",
        path: "/links/0/target/id",
        message: "Issue links must not target the source issue itself.",
        details: {
          issueId: "ISSUE-0112",
          rel: "references",
          targetIssueId: "ISSUE-0112",
        },
        related_issue_ids: ["ISSUE-0112"],
      },
    ]);
  }
});

test("parseIssueMarkdown rejects empty required string fields", () => {
  const source = `---
spec_version: mis/0.1
id: ""
title: Valid title
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
---

## Objective

Required canonical identifiers must not be empty.
`;

  expect(() => parseIssueMarkdown(source)).toThrow(
    "Expected `id` to be a non-empty string.",
  );
});

test("parseIssueMarkdown rejects unknown top-level frontmatter keys", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0109
title: Reject unknown frontmatter keys
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
priroity: high
---

## Objective

Typoed top-level keys should fail fast.
`;

  expect(() => parseIssueMarkdown(source)).toThrow(
    "Unexpected frontmatter field: priroity.",
  );
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

test("parseIssueMarkdown rejects required_before on non-dependency links", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0106
title: Reject invalid link gating
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: references
    target: ISSUE-0002
    required_before: completed
---

## Objective

Do not silently drop invalid dependency-only fields.
`;

  expect(() => parseIssueMarkdown(source)).toThrow(
    "Only `depends_on` links may declare `required_before`.",
  );
});

test("parseIssueMarkdown rejects empty shorthand target IDs", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0107
title: Reject empty shorthand target
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: references
    target: ""
---

## Objective

Shorthand target IDs must not be empty.
`;

  expect(() => parseIssueMarkdown(source)).toThrow(
    "Expected shorthand link `target` to be a non-empty string.",
  );
});

test("parseIssueMarkdown rejects unknown properties inside target objects", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0110
title: Reject unknown target properties
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: references
    target:
      id: ISSUE-0002
      hrf: ../issues/ISSUE-0002.md
---

## Objective

Target object typos should fail fast.
`;

  expect(() => parseIssueMarkdown(source)).toThrow(
    "Unexpected link target field: hrf.",
  );
});

test("parseIssueMarkdown rejects unknown properties inside links", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0111
title: Reject unknown link properties
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: references
    target: ISSUE-0002
    notes: typoed note field
---

## Objective

Closed link shapes should fail fast.
`;

  expect(() => parseIssueMarkdown(source)).toThrow(
    "Unexpected link field: notes.",
  );
});

test("parseIssueMarkdown preserves duplicate_of semantics that remain SHOULD-level", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0113
title: Keep duplicate semantics policy-dependent
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: duplicate_of
    target: ISSUE-0007
---

## Objective

Parser-time semantics should preserve duplicate_of links when they are not a hard validation failure.
`;

  expect(parseIssueMarkdown(source)).toMatchObject({
    spec_version: "mis/0.1",
    id: "ISSUE-0113",
    title: "Keep duplicate semantics policy-dependent",
    kind: "task",
    status: "accepted",
    created_at: "2026-03-22T10:24:00-05:00",
    links: [
      {
        rel: "duplicate_of",
        target: { id: "ISSUE-0007" },
      },
    ],
    body: `## Objective

Parser-time semantics should preserve duplicate_of links when they are not a hard validation failure.
`,
  });
});

test("parseMarkdownFrontmatterDocument parses YAML without relying on Bun.YAML", () => {
  const document = parseMarkdownFrontmatterDocument(`---
spec_version: mis/0.1
id: ISSUE-0102
title: Parse with supported YAML dependency
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
labels:
  - parser
  - compatibility
---

## Objective

Keep frontmatter parsing runtime-compatible.
`);

  expect(document.frontmatter).toMatchObject({
    spec_version: "mis/0.1",
    id: "ISSUE-0102",
    labels: ["parser", "compatibility"],
  });
});

test("parseMarkdownFrontmatterDocument accepts an optional UTF-8 BOM", () => {
  const document = parseMarkdownFrontmatterDocument(`\uFEFF---
spec_version: mis/0.1
id: ISSUE-0108
title: Parse BOM-prefixed files
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
---

## Objective

Treat BOM-prefixed Markdown files as valid input.
`);

  expect(document.frontmatter).toMatchObject({
    spec_version: "mis/0.1",
    id: "ISSUE-0108",
  });
  expect(document.body).toBe(`## Objective

Treat BOM-prefixed Markdown files as valid input.
`);
});

test("parseIssueMarkdown rejects resolution on non-terminal issues", () => {
  const source = `---
spec_version: mis/0.1
id: ISSUE-0103
title: Reject non-terminal resolutions
kind: task
status: accepted
resolution: done
created_at: 2026-03-22T10:24:00-05:00
---

## Objective

Resolution should not be silently dropped.
`;

  expect(() => parseIssueMarkdown(source)).toThrow(
    "Non-terminal issues with status `accepted` must not declare `resolution`.",
  );
});
