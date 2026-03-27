---
spec_version: mis/0.1
id: ISSUE-0001
title: Draft the first markdown issue tracking spec
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
updated_at: 2026-03-22T10:24:00-05:00
priority: high
labels:
  - spec
  - core
links:
  - rel: references
    target: ISSUE-0009
    note: Background research issue on agent-first workflows
extensions:
  acme/story_points: 3
---

## Objective

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
