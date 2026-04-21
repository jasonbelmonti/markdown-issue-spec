# Operator Guide

This guide documents the current MVP runtime exactly as shipped. It is for
local operators running the Bun server against the repository-root filesystem
layout.

## Filesystem layout

The service derives its storage root from `process.cwd()`. When you start the
server from the repository root, the expected on-disk layout is:

```text
<repo>/
  vault/
    issues/
      ISSUE-<id>.md
  .mis/
    index.sqlite
  index.ts
```

- `vault/issues/` is the canonical store.
- `.mis/index.sqlite` is a derived projection used by query routes.
- `.mis/index.sqlite` is disposable and can be rebuilt from canonical Markdown.

## Local startup

Install dependencies once:

```bash
bun install
```

Start the service from the root you want to operate on:

```bash
bun run index.ts
```

Current default runtime behavior:

- hostname: `127.0.0.1`
- port: `3000`
- canonical root: `<cwd>/vault/issues/`
- projection database: `<cwd>/.mis/index.sqlite`
- admin rebuild route is only exposed when the server is bound to loopback

The entrypoint starts the HTTP service, but it does not perform an implicit
startup rebuild of pre-existing Markdown files. If `vault/issues/` already has
issue files, run the rebuild route after startup before depending on query
responses.

## Route boundaries

Use mutation routes for all supported writes:

- `POST /issues` creates a new canonical issue file and refreshes projection
  state
- `PATCH /issues/:id` updates an existing issue with optimistic concurrency via
  `expectedRevision`
- `POST /issues/:id/transition` applies workflow transitions with validation and
  optimistic concurrency

Use query routes for read-only access to derived state:

- `GET /issues/:id`
- `GET /issues`
- `GET /validation/errors`

Use the admin route for explicit projection rebuilds:

- `POST /admin/rebuild-index`

Do not write `vault/issues/*.md` directly as a normal mutation path. Direct file
edits are treated as out-of-band drift.

## Rebuild flow

Rebuild the SQLite projection whenever either of these is true:

- the service started with existing canonical Markdown already under
  `vault/issues/`
- canonical files were edited, created, renamed, or removed outside the HTTP
  API

Run:

```bash
curl -X POST http://127.0.0.1:3000/admin/rebuild-index
```

Expected response shape:

```json
{
  "issue_count": 1,
  "failure_count": 0,
  "failures": []
}
```

- `issue_count` is the number of canonical issues indexed into SQLite.
- `failure_count` counts files that could not be parsed or accepted during the
  rebuild.
- `failures` contains per-file startup or rebuild failures.

Accepted API writes already trigger a rebuild of the derived projection, so you
do not need to call the admin route after a successful `POST /issues`,
`PATCH /issues/:id`, or `POST /issues/:id/transition`.

## Failure handling

### Validation failures on write

Mutation routes reject invalid writes with structured errors and leave canonical
Markdown unchanged. Common cases include:

- schema or field validation failures
- semantic validation failures
- invalid state transitions
- revision mismatches from stale `expectedRevision`

Use the response payload from the failed mutation to identify the rejected field
or transition. The underlying Markdown file remains at its previous revision.

### Inspecting indexed validation errors

Use the validation error query when you need to inspect issues discovered during
rebuild or startup-style scans:

```bash
curl "http://127.0.0.1:3000/validation/errors"
```

Supported filters:

- `issue_id`
- `severity`
- `code`

This endpoint reads from the SQLite projection and is the operator-facing way to
inspect known validation problems after a rebuild.

### Reasoning about out-of-band drift

The current MVP does not ship watcher-driven drift reconciliation. That means:

- query routes read the last rebuilt SQLite state, not raw Markdown files
- direct edits under `vault/issues/` are not reflected automatically
- deleting `.mis/index.sqlite` is safe because the projection is derived, but
  you must rebuild before query results are trustworthy again

Operator workflow for drift:

1. make or identify the out-of-band filesystem change
2. call `POST /admin/rebuild-index`
3. inspect `failure_count` and `failures`
4. query `GET /validation/errors` if rebuild surfaced invalid canonical files

## Minimal proof path

The smallest credible local proof of the shipped service is:

1. start the server with `bun run index.ts`
2. call `POST /admin/rebuild-index`
3. query one seeded issue with `GET /issues/:id`

That path is covered by the startup smoke test in
`server/http/local-startup-smoke.test.ts`.
