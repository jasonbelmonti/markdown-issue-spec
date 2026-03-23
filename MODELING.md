# Modeling Guide

Status: Non-normative guidance for `mis/0.1`

## 1. Purpose

This document shows how to model common planning and grouping concepts using the
existing primitives in `mis/0.1` without making those concepts first-class core
spec features.

Nothing in this guide changes conformance requirements in `SPEC.md`. It is a set
of patterns and tradeoffs for implementers and authors who want interoperable
ways to represent project-like organization.

## 2. Available Primitives

The core spec already provides enough building blocks to express many planning
shapes:

- `kind`: the role or category of an issue, such as `task`, `bug`, `epic`, or `project`
- `parent`: containment or rollup hierarchy
- `depends_on`: sequencing or prerequisite relationships
- `labels`: orthogonal grouping or faceting
- `extensions`: implementation-specific metadata that is useful but not universal

Suggested mental model:

- Use `kind` to say what something is.
- Use `parent` to say where it sits in a hierarchy.
- Use `depends_on` to say what must happen before something else.
- Use `labels` to group across hierarchies.
- Use `extensions` for local metadata such as owners, target dates, or estimation systems.

## 3. General Guidance

- Treat grouping concepts such as `project`, `initiative`, and `epic` as
  modeling conventions, not built-in spec objects.
- Prefer a small, stable set of local `kind` values rather than inventing a new
  one every Tuesday.
- Use `parent` for true structural containment or rollup, not for every
  relationship that happens to feel managerial.
- Use `labels` when an issue belongs to a category that cuts across multiple
  hierarchies.
- Use `extensions` only for metadata that does not need portable core semantics.

## 4. Pattern: Project as an Organizing Issue

One simple pattern is to model a project as an issue with `kind: project`.

Example project issue:

```yaml
---
spec_version: mis/0.1
id: PROJ-001
title: Markdown issue tracking system
kind: project
status: accepted
created_at: 2026-03-22T10:24:00-05:00
labels:
  - platform
extensions:
  acme/lead: jason
  acme/target_date: 2026-06-01
---
```

Example child epic:

```yaml
---
spec_version: mis/0.1
id: EPIC-001
title: Define spec and validation artifacts
kind: epic
status: accepted
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: parent
    target: PROJ-001
---
```

Use this pattern when you want a project to behave like a normal issue in the
graph, with its own status, narrative body, and dependencies.

## 5. Pattern: Epic as Intermediate Scope

An `epic` can be modeled as another issue kind that groups related tasks or
bugs.

Example task under an epic:

```yaml
---
spec_version: mis/0.1
id: ISSUE-014
title: Add JSON Schema for Markdown frontmatter
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
links:
  - rel: parent
    target: EPIC-001
---
```

This gives a simple rollup chain:

- `project` contains `epic`
- `epic` contains `task`

If your implementation prefers a flatter hierarchy, you MAY skip the `epic`
layer and make tasks children of a project directly.

## 6. Pattern: Initiative as Cross-Cutting Work

An `initiative` is often broader than a single project. There are two common
ways to model it.

### Option A: Initiative as a Parent

Use `kind: initiative` and attach child issues with `parent` links.

This works best when:

- your implementation embraces multi-parent DAGs
- initiative rollups are a first-class workflow
- you want the initiative to own status and narrative context

Tradeoff:

- multi-parent graphs are valid in the spec, but some tools may prefer simpler
  single-parent hierarchies

### Option B: Initiative as a Label or Related Issue

Use a label such as `initiative/spec-foundation` or link related issues to an
initiative issue via `related_to` instead of `parent`.

This works best when:

- the initiative cuts across multiple projects
- you want to avoid multiple parent relationships
- the grouping is useful for discovery but not for strict rollup semantics

Tradeoff:

- labels and `related_to` are lighter-weight than `parent`, so they provide less
  structural meaning

## 7. Pattern: Cross-Project Dependencies

Use `depends_on` for sequencing across grouping boundaries.

Example:

```yaml
links:
  - rel: depends_on
    target: ISSUE-003
    required_before: in_progress
```

This is a better fit than `parent` when the relationship is about prerequisite
work rather than containment.

If the relationship is advisory or merely suggestive, prefer `related_to`
instead of `depends_on`.

A good rule of thumb:

- if issue A is inside issue B, use `parent`
- if issue A must wait for issue B, use `depends_on`

## 8. Pattern: Labels for Orthogonal Grouping

Labels are useful when the grouping is real but should not control hierarchy.

Examples:

- team ownership: `team/platform`
- functional area: `area/spec`
- release train: `release/v1`
- planning bucket: `q2`

Labels work well for:

- filtering
- saved views
- cross-cutting slices
- temporary coordination groupings

Labels work poorly for:

- strict rollups
- expressing prerequisite order
- representing canonical parent-child structure

## 9. Pattern: Extensions for Local Planning Metadata

Use `extensions` for metadata that your local system cares about but that the
core spec should not define yet.

Examples:

```yaml
extensions:
  acme/story_points: 5
  acme/target_date: 2026-04-15
  acme/owner_team: platform
```

This is a good home for:

- estimation values
- target dates
- owners or routing metadata
- UI hints for a specific editor or plugin

This is a bad home for:

- relationships that need shared semantics across implementations
- canonical identity
- anything that should be part of graph validation

## 10. Choosing Between Primitives

Use `kind` when:

- you are naming the role of an issue, such as `project`, `epic`, or `initiative`

Use `parent` when:

- you want structural containment or rollup

Use `depends_on` when:

- you want prerequisite or sequencing semantics

Use `labels` when:

- you want lightweight grouping across structures

Use `extensions` when:

- you need implementation-specific metadata without standardizing it in the core

## 11. Recommended Local Conventions

If you want project-like organization without expanding the core spec, a simple
starting convention is:

- use `kind: project` for top-level organizing issues
- use `kind: epic` for intermediate scope buckets
- use `kind: task` or `kind: bug` for execution items
- use `parent` for hierarchy
- use `depends_on` for sequencing
- use labels for orthogonal slices such as team, area, or release
- use `extensions` for target dates, estimation, or local ownership fields

This convention is not required by `mis/0.1`, but it is a practical starting
point for interoperable authoring.
