---
spec_version: mis/0.1
id: ISSUE-0007
title: Define markdown frontmatter profile
kind: task
status: accepted
created_at: 2026-03-22T10:24:00-05:00
updated_at: 2026-03-22T10:24:00-05:00
priority: high
labels:
  - spec
  - profile
  - dependencies
assignees:
  - jason
links:
  - rel: parent
    target:
      id: EPIC-0001
      href: ../epics/EPIC-0001.md
  - rel: depends_on
    target:
      id: ISSUE-0002
      href: ./ISSUE-0002.md
    required_before: in_progress
    note: ID semantics should be stable before the profile is finalized
  - rel: depends_on
    target: ISSUE-0004
    required_before: completed
    note: Wait for example corpus review before declaring the profile complete
  - rel: related_to
    target: ISSUE-0012
    note: Relates to the indexing strategy work item
extensions:
  obsidian/css_class: profile-issue
---

## Objective

Define the concrete Markdown frontmatter profile for the core issue model.

## Context

The profile should map directly onto the abstract issue model.

## Constraints

The profile must keep file path concerns non-canonical. It should also allow
shorthand targets for ergonomics.

## Materially verifiable success criteria

- [ ] Frontmatter field mapping is documented.
- [ ] Shorthand and verbose target encodings are both defined.
- [ ] Title rendering precedence is defined.

## Notes

The dependency graph is intentionally directional. Gravity still works, but
`blocked_by` should not need its own frontmatter field.
