# Markdown Issue Spec

Status: Draft 0.1

## 1. Purpose

This document defines an implementation-independent issue tracking model intended
to serialize cleanly into Markdown documents while remaining usable outside any
single editor, database, or plugin ecosystem.

The spec is designed for agent-first workflows where issue documents are edited
directly, parsed mechanically, and indexed into a graph of issue relationships.

## 2. Design Principles

1. Canonical data should be easy to author and diff in a single file.
2. File paths, editor metadata, and implementation indexes are not part of issue identity.
3. Relationship data should be normalized and directed.
4. Derived views should not be stored as canonical truth.
5. The core model should be small, versioned, and extensible.

## 3. Non-Goals

This draft does not standardize:

- comments or discussion threads
- activity history or audit logs
- permissions or access control
- notifications
- time tracking
- attachments
- sprint, milestone, or roadmap semantics

Those may be layered on later as extensions or companion specs.

## 4. Conformance Language

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" in this
document are to be interpreted as described in RFC 2119 and RFC 8174.

## 5. Terminology

- Issue: a trackable work item or record in the issue graph.
- Issue document: a concrete serialization of one issue.
- Canonical field: a field that is part of the source-of-truth issue record.
- Derived field: a field that can be computed from canonical data or indexes.
- Link: a directed typed edge from one issue to another target.
- Relation type: the semantic label on a link, such as `depends_on`.
- Target: the referenced issue at the far end of a link.
- Body: the canonical human-readable narrative content of an issue.
- Markdown profile: a concrete serialization mapping this abstract model into Markdown.

## 6. Abstract Model

An issue record consists of:

- required identity and lifecycle metadata
- optional classification and ownership metadata
- zero or more typed links
- zero or more implementation-neutral extension values
- optional canonical narrative body content

### 6.1 Issue

An issue MUST support the following canonical fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `spec_version` | string | yes | Version identifier for this spec, for example `mis/0.1`. |
| `id` | string | yes | Stable logical identifier for the issue. |
| `title` | string | yes | Human-readable title. |
| `kind` | string | yes | Classification such as `task`, `bug`, or `epic`. |
| `status` | string | yes | Lifecycle state from the core status vocabulary. |
| `created_at` | timestamp | yes | RFC 3339 timestamp. |
| `updated_at` | timestamp | no | RFC 3339 timestamp. |
| `resolution` | string | no | Terminal outcome from the core resolution vocabulary. |
| `summary` | string | no | Short synopsis. |
| `body` | markdown string | no | Canonical narrative content. In the Markdown profile, this is serialized as the document body after frontmatter. |
| `priority` | string | no | Ordered importance label. |
| `labels` | array of string | no | Freeform or implementation-defined labels. |
| `assignees` | array of string | no | Opaque actor identifiers. |
| `links` | array of Link | no | Directed typed relationships. |
| `extensions` | map | no | Namespaced extension data. |

An implementation MAY support additional fields, but additional canonical fields
SHOULD be placed under `extensions` unless and until standardized by this spec.

### 6.2 Identity

- `id` MUST be stable across file renames or moves.
- `id` uniqueness is defined within an implementation-defined namespace, such as
  a repository, vault, workspace, or explicitly declared project scope.
- File paths, slugs, and titles MUST NOT be treated as canonical identity.

### 6.3 Status Vocabulary

This draft standardizes the following core statuses:

| Status | Meaning | Terminal |
| --- | --- | --- |
| `proposed` | The issue has been captured but is not yet accepted for execution. | no |
| `accepted` | The issue has been accepted or queued, but active work has not started. | no |
| `in_progress` | The issue is in active execution. | no |
| `completed` | The issue reached its intended outcome. | yes |
| `canceled` | The issue will not be completed as currently tracked. | yes |

Rules:

- Transition into `in_progress` is the start of active work.
- Transition into `completed` is a successful close.
- Transition into `canceled` is an unsuccessful close.
- Non-terminal issues MUST NOT declare `resolution`.
- Terminal issues MUST declare `resolution`.

### 6.4 Resolution Vocabulary

This draft standardizes the following core resolutions:

- `done`
- `duplicate`
- `obsolete`
- `wont_do`
- `superseded`

Rules:

- `completed` MUST use `resolution: done`.
- `canceled` MUST use exactly one of `duplicate`, `obsolete`, `wont_do`, or `superseded`.
- `done` MUST NOT appear on `canceled` issues.
- Non-`done` resolutions MUST NOT appear on `completed` issues.
- If `resolution` is `duplicate`, the issue SHOULD contain a `duplicate_of` link.

### 6.5 Link

A Link MUST support the following fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `rel` | string | yes | Relation type. |
| `target` | IssueRef | yes | The issue being referenced. |
| `required_before` | string | depends_on only | Required when `rel` is `depends_on`. Names the source-issue status transition that the dependency blocks. |
| `note` | string | no | Human-readable annotation. |
| `extensions` | map | no | Namespaced extension data. |

Identical links SHOULD NOT be duplicated within a single issue.

### 6.6 IssueRef

An IssueRef MUST identify the target issue by stable `id`.

An IssueRef MAY also include optional locator hints such as:

- `href`: a relative or absolute URI
- `path`: a repository- or vault-relative file path
- `title`: a non-canonical display title

Rules:

- `id` is the canonical target identity.
- Locator hints MUST NOT override `id`.
- A missing target SHOULD be treated as an unresolved reference.

### 6.7 IssueRef Locator Consistency

- Readers MUST treat `id` as authoritative when resolving issue identity.
- `href` and `path` are non-canonical locator hints.
- If a reader can resolve `href` or `path` to a concrete issue document and that
  document's `id` differs from the canonical `id`, the IssueRef is invalid.
- If both `href` and `path` are present and resolve to different issue
  documents, the IssueRef is invalid.
- If a reader cannot resolve `href` or `path`, it MAY continue using `id` as the
  canonical reference target.
- Writers SHOULD keep `href` and `path` synchronized with `id` whenever the
  concrete document location is known.

## 7. Relationship Semantics

The core model uses a normalized directed `links` array rather than storing
multiple top-level relationship fields.

This draft standardizes the following relation types:

| `rel` | Meaning | Expected inverse view |
| --- | --- | --- |
| `parent` | This issue is a child of the target issue. | `children` |
| `depends_on` | This issue depends on the target issue. | `blocks` |
| `duplicate_of` | This issue is a duplicate of the target issue. | `duplicates` |
| `related_to` | This issue is semantically related to the target issue. | `related_to` |
| `references` | This issue mentions or cites the target issue without stronger semantics. | `referenced_by` |

Rules:

- Links are directed.
- Implementations SHOULD derive inverse views rather than store them canonically.
- A self-link SHOULD be treated as invalid unless explicitly allowed by a future extension.

### 7.1 Dependency Semantics

`depends_on` links MUST declare:

- `required_before`: `in_progress` or `completed`

Interpretation:

- `depends_on` is always a blocking dependency.
- `required_before: in_progress` blocks transition of the source issue into `in_progress`.
- `required_before: completed` blocks transition of the source issue into `completed`.
- Dependencies never block transition of the source issue into `canceled`.
- A dependency is satisfied when the target issue has `status: completed` and
  `resolution: done`.
- A dependency is unsatisfied in every other target lifecycle state, including
  `canceled`.
- `required_before` MUST be present on `depends_on` links.

If a dependency target is `canceled` with `resolution: duplicate` or
`superseded` and a replacement issue is known, producers SHOULD retarget the
dependency to the replacement issue.

### 7.2 Parent / Child Semantics

- A `parent` link states that the current issue is a child of the target issue.
- An issue MAY have multiple `parent` links if the implementation permits multi-parent hierarchies.
- The graph formed by `parent` links MUST be acyclic.
- Implementations that require a tree rather than a graph MAY further restrict
  this, but such restrictions are implementation policy rather than core spec.

### 7.3 Duplicate Semantics

- `duplicate_of` indicates that the current issue should generally not be worked independently.
- A terminal duplicate SHOULD use `status: canceled` and `resolution: duplicate`.
- The target of `duplicate_of` SHOULD be a non-duplicate canonical issue when possible.

## 8. Canonical vs Derived Data

The following views are derived and SHOULD NOT be stored as canonical issue data:

- `children`
- `blocked_by`
- `blocks`
- `duplicates`
- `ready`
- `is_blocked`
- backlink counts
- graph depth or rollup state

Implementations MAY cache derived values for performance, but cached values
SHOULD live outside the canonical issue document or inside clearly marked
implementation-specific extension data.

## 9. Validation Rules

An issue document is valid against this draft when all of the following hold:

1. Required fields are present.
2. `created_at` and `updated_at`, when present, are valid RFC 3339 timestamps.
3. `status` is in the core status vocabulary.
4. `resolution`, when present, is in the core resolution vocabulary.
5. `resolution` is absent on non-terminal issues.
6. Terminal issues declare a valid `status` and `resolution` combination.
7. Each link has `rel` and `target`.
8. Each in-graph target identifies an issue by stable `id`.
9. No link self-targets the current issue.
10. Any resolvable `href` or `path` locator hints are consistent with the
    canonical `id`.

Graph-level validation rules:

- Producers MUST NOT create cycles in the `depends_on` graph.
- Producers MUST NOT create cycles in the `parent` graph.
- Implementations that can analyze the issue graph SHOULD detect dependency
  cycles and parent cycles and surface them as validation errors.
- Missing targets SHOULD be surfaced as unresolved references rather than silently ignored.

## 10. Extensions

Extensions are allowed in two places:

- top-level `extensions`
- `link.extensions`

Extension keys SHOULD be namespaced. Examples:

- `acme/story_points`
- `obsidian/css_class`
- `plugin.example/render_hints`

Unrecognized extensions MUST be ignored by conforming readers unless explicitly
configured otherwise.

Custom relation types are also allowed, but SHOULD be namespaced to avoid
collision with the core relation vocabulary.

This draft does not define extensions to the core `status` or `resolution`
vocabularies. Conforming `mis/0.1` documents MUST use only the core values
defined in Sections 6.3 and 6.4.

## 11. Mutation and Round-Trip Semantics

- A writer that changes canonical issue data SHOULD update `updated_at` to the
  time of mutation.
- If `updated_at` is present, a writer that changes canonical issue data MUST
  update it.
- If `updated_at` is absent, a writer MAY add it when making the first canonical
  mutation.
- Canonical issue data includes the canonical top-level issue fields, canonical
  `body`, `links`, and `extensions`.
- Writers SHOULD NOT change `updated_at` for formatting-only or
  serialization-only rewrites that do not change canonical issue data.
- Writers MUST preserve unknown keys and values under `extensions` and
  `link.extensions` when reading and rewriting a document, unless explicitly
  instructed to remove them.
- Writers MUST preserve `links` array ordering on round-trip unless an explicit
  user action or documented normalization policy reorders it.
- Readers MUST NOT infer semantics from frontmatter key ordering.

## 12. Markdown Serialization Profile

This spec does not require Markdown, but it is designed to serialize cleanly into
Markdown documents with YAML frontmatter.

The first concrete profile for this draft is defined in
`PROFILES/markdown-frontmatter.md`.

A non-normative modeling guide for higher-level planning concepts is provided in
`MODELING.md`.

## 13. Open Questions

This draft intentionally leaves several areas unresolved:

- whether actor references should become a first-class typed object
- whether `project`, `milestone`, or `iteration` belong in the core model
- whether issue IDs should have a recommended grammar
- whether relation targets should support non-issue object types in the core model
- whether checklist items in the canonical body should ever be promoted to structured data

Those should be decided only after exercising the draft against realistic issue sets.
