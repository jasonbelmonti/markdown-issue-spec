import { expect, test } from "bun:test";

import { parseMarkdownFrontmatterDocument } from "../parser/frontmatter.ts";
import {
  MarkdownFrontmatterValidationError,
  validateMarkdownFrontmatter,
} from "./index.ts";

test("validateMarkdownFrontmatter returns deterministic structured schema and profile errors", () => {
  const frontmatter = parseMarkdownFrontmatterDocument(`---
spec_version: mis/0.1
id: ISSUE-0200
title: Collect validation failures
kind: task
status: proposed
created_at: definitely-not-a-timestamp
body: this field is forbidden
priroity: high
---

## Objective

Collect structured errors.
`).frontmatter;

  expect(validateMarkdownFrontmatter(frontmatter)).toEqual([
    {
      code: "profile.forbidden_frontmatter_field",
      source: "profile",
      path: "/body",
      message:
        "Markdown frontmatter must not declare `body`; use the Markdown document body instead.",
      details: {
        field: "body",
      },
    },
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
});

test("validateMarkdownFrontmatter returns profile rule failures for terminal resolution rules", () => {
  const frontmatter = parseMarkdownFrontmatterDocument(`---
spec_version: mis/0.1
id: ISSUE-0201
title: Completed issues need done
kind: task
status: completed
resolution: duplicate
created_at: 2026-03-22T10:24:00-05:00
---

## Objective

Make terminal validation explicit.
`).frontmatter;

  expect(validateMarkdownFrontmatter(frontmatter)).toEqual([
    {
      code: "profile.completed_resolution_must_be_done",
      source: "profile",
      path: "/resolution",
      message: "Completed issues must use `resolution: done`.",
      details: {
        status: "completed",
        resolution: "duplicate",
      },
    },
  ]);
});

test("validateMarkdownFrontmatter rejects dependency links without required_before", () => {
  const frontmatter = parseMarkdownFrontmatterDocument(`---
spec_version: mis/0.1
id: ISSUE-0202
title: Dependency links require gating
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: depends_on
    target: ISSUE-0002
---

## Objective

Catch missing dependency gating in the validator.
`).frontmatter;

  expect(validateMarkdownFrontmatter(frontmatter)).toEqual([
    {
      code: "schema.required",
      source: "schema",
      path: "/links/0/required_before",
      message: "Dependency links must declare `required_before`.",
      details: {
        keyword: "required",
        property: "required_before",
        schemaPath: "#/allOf/0/then/required",
      },
    },
  ]);
});

test("validateMarkdownFrontmatter rejects required_before on non-dependency links", () => {
  const frontmatter = parseMarkdownFrontmatterDocument(`---
spec_version: mis/0.1
id: ISSUE-0203
title: Non-dependency links cannot declare gating
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: references
    target: ISSUE-0002
    required_before: completed
---

## Objective

Catch invalid non-dependency gating in the validator.
`).frontmatter;

  expect(validateMarkdownFrontmatter(frontmatter)).toEqual([
    {
      code: "schema.not",
      source: "schema",
      path: "/links/0/required_before",
      message: "Only `depends_on` links may declare `required_before`.",
      details: {
        keyword: "not",
        schemaPath: "#/allOf/0/else/not",
      },
    },
  ]);
});

test("MarkdownFrontmatterValidationError retains structured validation errors", () => {
  const error = new MarkdownFrontmatterValidationError([
    {
      code: "profile.forbidden_frontmatter_field",
      source: "profile",
      path: "/body",
      message:
        "Markdown frontmatter must not declare `body`; use the Markdown document body instead.",
      details: {
        field: "body",
      },
    },
    {
      code: "schema.additional_properties",
      source: "schema",
      path: "/priroity",
      message: "Unexpected frontmatter field: priroity.",
      details: {
        property: "priroity",
      },
    },
  ]);

  expect(error.message).toBe(`Markdown frontmatter validation failed:
- /body: Markdown frontmatter must not declare \`body\`; use the Markdown document body instead.
- /priroity: Unexpected frontmatter field: priroity.`);
  expect(error.errors).toHaveLength(2);
});
