# Markdown Frontmatter Profile

Status: Draft 0.1 profile for `mis/0.1`

## 1. Scope

This profile defines how the abstract model in `SPEC.md` maps onto a single
Markdown document with YAML frontmatter.

This profile is intentionally conservative:

- one file represents one issue
- YAML frontmatter stores canonical structured metadata
- the Markdown document body stores the canonical narrative `body`
- file location is a locator hint, not issue identity

## 2. Canonical Field Mapping

In this profile:

- YAML frontmatter stores every canonical field except `body`
- the Markdown content after the closing frontmatter fence is the canonical `body`

Example:

```md
---
spec_version: mis/0.1
id: ISSUE-0007
title: Define markdown issue spec
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
updated_at: 2026-03-22T10:24:00-05:00
priority: high
labels:
  - spec
  - core
assignees:
  - jason
links:
  - rel: parent
    target:
      id: EPIC-0001
      href: ../epics/EPIC-0001.md
  - rel: depends_on
    target:
      id: ISSUE-0003
    required_before: in_progress
    note: Finalize ID grammar first
extensions:
  obsidian/css_class: issue-spec
---

## Objective

Define the first draft of the markdown issue spec.
```

Rules:

- Readers MUST map the Markdown document body to the abstract `body` field.
- Writers MUST serialize the abstract `body` field into the Markdown document body.
- This profile MUST NOT use frontmatter `body` or `description` keys as canonical fields.
- A document that includes frontmatter `body` or `description` keys is invalid for this profile.

## 3. Body Conventions

The canonical body is not required to use a fixed template, but the following
headings are RECOMMENDED for interoperable authoring and agent workflows:

- `Objective`
- `Context`
- `Constraints`
- `Materially verifiable success criteria`
- `Notes`

These headings are narrative structure, not additional structured metadata.

Recommended example:

```md
## Objective

Define the first draft of the markdown issue spec.

## Context

The spec is intended to serve as the basis for an agent-first issue system.

## Constraints

The spec must remain independent of Obsidian while serializing cleanly into Markdown.

## Materially verifiable success criteria

- [ ] Core issue fields are defined.
- [ ] Link semantics are defined.
- [ ] Markdown profile examples are included.

## Notes

Keep the core relation vocabulary intentionally small.
```

## 4. Target Encoding

This profile allows two encodings for `target`.

Verbose form:

```yaml
target:
  id: ISSUE-0003
  href: ../issues/ISSUE-0003.md
```

Shorthand form:

```yaml
target: ISSUE-0003
```

When the shorthand form is used, readers MUST interpret it as:

```yaml
target:
  id: ISSUE-0003
```

## 5. Title Rendering

The canonical title is `title` in frontmatter.

Rules:

- Renderers SHOULD use the frontmatter `title` as the issue title.
- Authors SHOULD NOT duplicate the title as an H1 in the body.
- If an H1 is present and differs from frontmatter `title`, frontmatter MUST win.

## 6. File Naming

This profile does not standardize a required file naming convention.

Recommended patterns include:

- `ISSUE-0007.md`
- `Define markdown issue spec.md`
- `task-define-markdown-issue-spec.md`

Rules:

- File names MAY change without changing issue identity.
- Implementations SHOULD preserve `id` across file renames.

## 7. Parsing Notes

Readers conforming to this profile SHOULD:

- parse YAML frontmatter before reading the body
- preserve unknown keys under `extensions`
- preserve array ordering in `links`
- tolerate absent optional fields
- surface malformed YAML as a validation error
- surface frontmatter `body` or `description` keys as profile validation errors

Readers MAY normalize timestamps, labels, and shorthand targets internally, but
SHOULD round-trip canonical values without semantic loss.

## 8. JSON Schema

The parsed YAML frontmatter for this profile is validated by
`SCHEMAS/markdown-frontmatter.schema.json`, which targets JSON Schema draft
2020-12.

The schema is intentionally strict at the top level:

- only canonical profile frontmatter fields are allowed
- implementation-specific data belongs under top-level `extensions`
- `rel` remains an open string because the core spec allows custom namespaced relation types

The schema covers frontmatter shape only. It validates:

- required canonical frontmatter fields for this profile
- RFC 3339 timestamps via JSON Schema `date-time` format
- terminal `status` and `resolution` combinations
- shorthand string and verbose object forms for `target`
- rejection of frontmatter `body` and `description`

The schema does not validate:

- Markdown body content or the recommended body headings
- self-links, missing targets, or agreement between `target.id` and `href` or `path`
- dependency cycles or `parent` graph cycles
- repository, vault, or graph-wide resolution of referenced issues

Example parsed-frontmatter fixtures live under `fixtures/valid/` and
`fixtures/invalid/`.
