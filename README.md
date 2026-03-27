# Markdown Issue Spec

This repository defines a Markdown-friendly, implementation-independent issue
tracking spec and ships a Bun-based validator for the Markdown frontmatter
profile.

## Install

```bash
bun install
```

## Validate

Validate the full repo surface:

```bash
bun run validate
```

Validate only JSON fixtures:

```bash
bun run validate --fixtures-only
```

Validate only Markdown examples:

```bash
bun run validate --examples-only
```

Validate an arbitrary Markdown file:

```bash
bun run validate path/to/issue.md
```

Validate every Markdown file under a directory:

```bash
bun run validate path/to/issues
```

## Test

```bash
bun test
```

## What The Validator Checks

- JSON files in `fixtures/valid` must pass schema validation.
- JSON files in `fixtures/invalid` must fail schema validation.
- Markdown files in `EXAMPLES` must contain parseable YAML frontmatter whose
  parsed data passes `SCHEMAS/markdown-frontmatter.schema.json`.
- Explicit file or directory arguments are treated as custom Markdown targets
  and validated against the same schema.

## Out Of Scope

The validator intentionally does not check:

- Markdown body headings or body structure
- graph-wide rules such as cycles or cross-file resolution
- locator consistency between `target.id` and `href` or `path`
- CI, release automation, or any non-schema linting
