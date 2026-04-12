# Thin Deployability Roadmap

## Summary

After the MVP proves its value, the first deployability goal is not "run
everywhere." The first goal is to make the default Bun server deployable in one
thin, comprehensible way without changing the core product bet:

- canonical issue data remains Markdown on writable storage
- SQLite remains a disposable projection
- the initial supported topology remains single-instance and private/trusted

The thinnest path is:

1. make the Bun server deployment-ready as a configurable process
2. package that process for one container with one persistent volume
3. only then evaluate broader portability for hosts without durable local disk

## Decisions

- Runtime stays Bun.
- Canonical storage stays Markdown issue files under `vault/issues/`.
- Derived state stays SQLite under `.mis/index.sqlite`.
- The first supported deployment shape is one Bun process with mounted
  persistent storage.
- Docker is treated as packaging, not as a platform commitment or architecture
  rewrite.
- Public-internet hardening, auth, HA, serverless deployment, and
  database-canonical redesign are explicitly deferred from the thin first pass.

## Supported Initial Topology

The first supported non-local deployment shape is:

```text
container
  /data/
    vault/
      issues/
        ISSUE-<id>.md
    .mis/
      index.sqlite
```

- `/data/vault/issues` stores canonical Markdown and must be persisted.
- `/data/.mis/index.sqlite` is disposable but should be persisted in the first
  supported setup for faster restarts.
- The service runs as one instance only.
- The service is intended for private/trusted access first, not open internet
  exposure.

## Roadmap

### Stage 1: Deployment-ready process

- Add explicit runtime configuration for host, port, root directory, and
  projection database path.
- Fail fast on invalid runtime configuration.
- Preserve safe local defaults while allowing deployed environments to bind to
  the correct host and data paths.

### Stage 2: Health semantics and startup proof

- Add liveness and readiness endpoints.
- Make readiness reflect the usability of canonical storage and projection
  state, not just process aliveness.
- Verify the supported single-instance startup and rebuild path.

### Stage 3: Single-container packaging

- Add a minimal `Dockerfile` and `.dockerignore`.
- Support one documented persistent-volume layout.
- Ensure the service can boot from environment configuration plus mounted data.

### Stage 4: Operator documentation

- Document build, run, restart, rebuild, and failure handling.
- Explain clearly what data must be persisted and what can be rebuilt.
- Keep the operator guide aligned to the actual supported runtime behavior.

### Stage 5: Broader portability

- Only after the thin baseline is working, define a canonical-store abstraction
  for broader portability.
- Evaluate a non-filesystem backend for hosts without durable local disk.
- Keep single-instance behavior explicit before any multi-instance expansion.

## Tracking In Linear

This roadmap is tracked inside the existing `markdown-issue-spec` Linear
project under the `Post-MVP Default Implementation` milestone.

- `BEL-734`: `MIS9.4: Post-MVP - Thin deployability baseline for the default Bun server`
- `BEL-735`: `MIS9.4a: Add deployment-oriented runtime configuration and startup validation`
- `BEL-736`: `MIS9.4b: Add liveness/readiness endpoints and single-instance startup proof`
- `BEL-737`: `MIS9.4c: Package the default Bun server for single-container deployment`
- `BEL-738`: `MIS9.4d: Write deployability operator guide and persistent-volume runbook`
- `BEL-733`: `MIS9.5: Post-MVP - Broader portability for hosts without durable local disk`

These issues are intentionally parked as post-MVP work. They should not compete
with the active MVP critical path.

## Activation Rules

- Keep this lane in backlog until the MVP umbrella is substantially complete.
- Pull one `MIS9.4x` child into active execution at a time.
- Use the thin containerized single-instance path as the default unless the
  baseline proves insufficient.
- Revisit the broader portability lane only after the thin baseline has been
  implemented or invalidated.

## Non-Goals For The First Pass

- public internet exposure
- auth and authorization
- multi-instance coordination
- external SQL as canonical storage
- edge/serverless portability
- broad cloud-specific deployment matrices
