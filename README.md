# markdown-issue-spec

`markdown-issue-spec` is an agent-first issue service where canonical issues live
as Markdown under `vault/issues/` and query state lives in SQLite under
`.mis/index.sqlite`.

## Local operator quickstart

Install dependencies:

```bash
bun install
```

Start the shipped HTTP service from the repository root:

```bash
bun run index.ts
```

The default entrypoint listens on `http://127.0.0.1:3000` and uses the current
working directory as the filesystem root for both `vault/issues/` and
`.mis/index.sqlite`.

If `vault/issues/` already contains canonical Markdown files, rebuild the
projection after startup so query routes reflect that state:

```bash
curl -X POST http://127.0.0.1:3000/admin/rebuild-index
```

## MVP route boundaries

- Mutation routes: `POST /issues`, `PATCH /issues/:id`,
  `POST /issues/:id/transition`
- Query routes: `GET /issues/:id`, `GET /issues`,
  `GET /validation/errors`
- Admin route: `POST /admin/rebuild-index` on loopback only

Accepted API writes update canonical Markdown and rebuild the SQLite projection.
Direct filesystem edits are treated as drift and require an explicit rebuild.

## Operator documentation

- [docs/operator-guide.md](docs/operator-guide.md) for filesystem layout,
  startup, rebuild flow, validation inspection, and drift handling
- `docs/task.md`
- `docs/spec.md`
- `docs/modeling.md`
- `docs/profiles/markdown-frontmatter.md`
- `docs/schemas/markdown-frontmatter.schema.json`
- `docs/examples/`
- `docs/fixtures/`
- `docs/plans/`
- `docs/plans/deployment-thin-path.md`
