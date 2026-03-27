# Agent-First MVP Plan

## Summary

Build an agent-first task system where spec-compliant Markdown files remain the
canonical store, but all mutations go through a localhost Bun API that validates
before writing. The first milestone is server-only: no Obsidian plugin in v1,
no full-text body search in v1, and no direct file writes by agents.

Canonical issue files live in a vault-compatible directory so Obsidian can be
added later without changing the data model.

## Decisions

- Runtime: Bun with `Bun.serve()` and `bun:sqlite`
- Canonical store: Markdown issue files under `vault/issues/`
- Derived state: SQLite under `.mis/index.sqlite`
- Writers: autonomous agents only, via localhost HTTP API
- Readers: agents via HTTP API; direct file reads are allowed for debugging but
  not part of the normal application path
- Search in v1: metadata and graph queries only; no FTS yet
- UI in v1: none required; Obsidian remains a future consumer of the same files

## Filesystem Layout

```text
vault/
  issues/
    ISSUE-<id>.md
.mis/
  index.sqlite
server/
  ...
docs/
  plans/
    agent-first-mvp.md
```

- `vault/issues/` is the only canonical data directory in v1.
- `.mis/index.sqlite` is disposable and must be rebuildable from Markdown.
- File naming in v1 defaults to `<id>.md` to keep path resolution simple.

## Architecture

### Canonical Markdown

- One file represents one issue.
- Frontmatter stores canonical structured fields.
- Markdown after frontmatter stores the canonical `body`.
- Writers use shorthand link targets by default:

```yaml
links:
  - rel: depends_on
    target: ISSUE-0001
```

- Writers do not emit `href` or `path` locator hints in v1.
- If `body` is omitted on create, the service writes a default template with:
  - `Objective`
  - `Context`
  - `Constraints`
  - `Materially verifiable success criteria`
  - `Notes`

### Bun Service

- The Bun service is the only supported mutation path.
- Agents must not write `vault/issues/*.md` directly.
- The service:
  - parses Markdown into canonical issue records
  - validates frontmatter, semantics, and graph rules
  - serializes canonical issue records back to Markdown
  - writes files atomically
  - updates the SQLite projection

### SQLite Projection

- SQLite stores parsed issues, normalized labels, assignees, links, revisions,
  and validation errors.
- Query endpoints read from SQLite, not from raw Markdown files.
- A full rebuild can recreate SQLite entirely from canonical Markdown.
- No FTS tables in v1.

## Validation Model

Validation is hard-gated on write. If validation fails, the service returns an
error and no file is written.

Validation layers:

1. Frontmatter/profile validation
   - existing JSON Schema
   - reject frontmatter `body` and `description`
   - normalize shorthand and verbose `target` forms
2. Semantic validation
   - status/resolution combinations
   - self-links
   - duplicate semantics
   - transition rules
3. Graph validation
   - unresolved references
   - `parent` cycle detection
   - hard `depends_on` cycle detection

On startup the service scans the vault, builds an `id -> issue` map, indexes all
issues, and records any pre-existing invalid files in SQLite. On accepted
mutations it recomputes only the affected issue plus adjacent graph neighbors.

## API Contract

### `POST /issues`

- Input: canonical issue fields plus optional `body`
- Default id generation: `ISSUE-<ULID>`
- Response: `201` with `IssueEnvelope`

### `GET /issues/:id`

- Returns `IssueEnvelope`

### `GET /issues`

- Filter-only list endpoint with cursor pagination
- Supported filters in v1:
  - `status`
  - `kind`
  - `label`
  - `assignee`
  - `parent_id`
  - `depends_on_id`
  - `ready`
  - `updated_after`
  - `limit`
  - `cursor`

### `PATCH /issues/:id`

- Input: `expectedRevision` plus partial canonical field changes
- Response:
  - `200` updated issue
  - `409` revision mismatch
  - `422` validation failure

### `POST /issues/:id/transition`

- Input: `expectedRevision`, `to_status`, optional `resolution`
- Enforces dependency gates and lifecycle rules before write

### `GET /validation/errors`

- Returns indexed validation failures
- Supports filtering by `issue_id`, `severity`, and `code`

### `POST /admin/rebuild-index`

- Rebuilds SQLite from canonical Markdown
- Localhost-only in v1

## Core Types

### `IssueEnvelope`

```json
{
  "issue": {},
  "derived": {
    "children_ids": [],
    "blocks_ids": [],
    "blocked_by_ids": [],
    "duplicates_ids": [],
    "ready": true,
    "is_blocked": false
  },
  "revision": "content-hash",
  "source": {
    "file_path": "vault/issues/ISSUE-....md",
    "indexed_at": "2026-03-26T12:00:00Z"
  }
}
```

### `ValidationError`

```json
{
  "code": "parent_cycle",
  "severity": "error",
  "message": "Parent graph contains a cycle.",
  "issue_id": "ISSUE-123",
  "file_path": "vault/issues/ISSUE-123.md",
  "field_path": "links[0].target",
  "related_issue_ids": ["ISSUE-456"]
}
```

## Milestones

### Milestone 1: Core parser and validator

- Implement canonical types
- Implement Markdown parser and serializer
- Reuse the existing frontmatter schema
- Implement semantic validation and transition guards

### Milestone 2: Filesystem store and SQLite index

- Implement startup scan of `vault/issues/`
- Implement SQLite schema and rebuild flow
- Implement atomic writes
- Implement file watcher reconciliation for out-of-band changes

### Milestone 3: HTTP API

- Implement create, get, list, patch, transition, validation, and rebuild
  endpoints
- Add optimistic concurrency via `expectedRevision`
- Return structured errors

### Milestone 4: Hardening

- Add structured logs
- Add integration tests with Bun
- Add operator documentation for layout, rebuilds, and failure handling

## Test Plan

- Parser/profile tests
  - valid fixtures parse successfully
  - frontmatter `body` and `description` are rejected
  - target normalization works for shorthand and object forms
  - unknown `extensions` round-trip unchanged
- Semantic validation tests
  - `completed` requires `resolution: done`
  - `canceled` rejects `resolution: done`
  - self-links are rejected
  - unsatisfied hard dependencies block `in_progress` and `completed`
- Graph validation tests
  - unresolved targets are detected
  - `parent` cycles are detected
  - hard `depends_on` cycles are detected
- Storage/index tests
  - startup scan populates SQLite from Markdown
  - rebuild reproduces the same indexed state
  - atomic writes never leave partial files
  - external file changes are reindexed and surfaced
- API tests
  - create returns generated id and revision
  - patch rejects stale revisions
  - invalid mutations return `422` without modifying files
  - list filters and derived readiness state behave correctly

## Assumptions

- Autonomous agents are the only intended writers in v1.
- Agents always use the localhost HTTP API.
- Direct file edits are treated as drift, not the primary workflow.
- Obsidian support is deferred, but the file layout stays compatible with a
  future vault-based UI.
- Full-text search is explicitly deferred until metadata and graph query needs
  are proven.
