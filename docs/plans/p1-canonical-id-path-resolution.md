# P1 Canonical ID / Path Resolution Design

## Summary

This document defines the redesign required to address P1 correctly:

- `id` must remain the canonical identity of an issue
- file path must become a mutable locator rather than an identity surrogate
- every issue surfaced by projection/query paths must remain writable through the
  mutation paths

The key constraint is read/write coherence. A design that allows startup scan or
projection to discover renamed files by frontmatter `id`, while mutations still
resolve writable targets through `vault/issues/<id>.md`, is invalid because it
creates issues that are readable but not writable.

## Problem

The current implementation couples issue identity to file naming in multiple
places:

- startup scan expects `basename(filePath, ".md") === issue.id`
- targeted reads and writes resolve existing issues through
  `vault/issues/<id>.md`
- projection stores `issue_id` and `file_path`, but the write path does not use
  projection as a locator source

That coupling conflicts with the spec, which says:

- `id` is the canonical identity
- `id` must survive renames or moves
- file path is a non-canonical locator hint

It also creates an architectural split:

- query flows are already comfortable returning `issue_id` plus `source.file_path`
- mutation flows still assume the current writable path can be derived from
  `issue_id`

PR #45 demonstrated why a local fix is unsafe: relaxing filename checks during
startup scan made projection capable of returning issues that patch/transition
could not subsequently load.

## Goals

1. Make `issue.id` the only canonical identity for existing issues.
2. Allow issue files to be renamed without breaking scan, projection, read, or
   write paths.
3. Ensure every issue returned by `GET /issues/:id` or `GET /issues` is
   addressable by patch and transition operations using the same `id`.
4. Preserve deterministic failure when duplicate ids exist in multiple files.
5. Keep create semantics simple for v1: new issues may still default to
   `vault/issues/<id>.md`, but canonical id uniqueness must still be enforced
   before and after persist.

## Non-Goals

- solving P2 locator-hint consistency validation
- solving P3 IssueRef encoding preservation
- changing the canonical issue schema
- changing the HTTP contract shape for issue ids
- introducing a non-filesystem canonical store
- implementing recursive discovery unless explicitly chosen as part of this work

## Design Principles

### Canonical identity and current locator must be modeled separately

Existing issues need two different concepts:

- canonical identity: `issue.id`
- current locator: the current file path where that issue lives

Those concepts should not be reconstructed from each other by naming
convention.

### Projection must not outgrow the write path

If projection can surface an issue, the write path must be able to resolve the
same issue id to its current canonical file. Projection and mutation resolution
must use the same locator model.

### Canonical id uniqueness must be enforced independently of the default path

The default create path may remain `vault/issues/<id>.md`, but that path is not
the uniqueness boundary once renames are allowed.

Create must therefore:

- check whether the canonical `issue.id` is already occupied before choosing a
  new file path
- treat post-persist rebuild failures as mutation failures rather than "best
  effort" warnings

Otherwise a renamed file can already own `ISSUE-1234` while create
incorrectly succeeds at `vault/issues/ISSUE-1234.md`.

### Targeted reads still need id/path agreement checks

Even after scan-time filename enforcement is relaxed, targeted reads must still
verify that the resolved file for `ISSUE-1234` actually contains
`id: ISSUE-1234`. The mismatch check stays valuable; it just moves from
"filename equals id" to "resolved file contents equal requested id".

### Startup and mutation must share one accepted-issue model

Startup scan and mutation-time validation cannot each invent their own notion of
which parsed files "count".

The same normalization rules must determine the accepted issue set for:

- projection rebuild
- mutation-time graph validation
- mutation response envelope construction

If duplicate ids or other normalization rules exclude a file from projection,
that same file must also be excluded from mutation-side derived state.

## Current Architecture Snapshot

### Startup and scan

- `listCanonicalIssueFiles(rootDirectory)` enumerates files under `vault/issues`
- `scanIssueFile()` parses Markdown and rejects files whose basename does not
  match frontmatter `id`
- startup indexing stores the current `source.file_path` in projection

### Projection and query

- projection already stores both `issue_id` and `file_path`
- `readIssueEnvelope(issueId)` resolves by `issue_id` only
- query responses already expose `source.file_path`

### Mutation and store

- `FilesystemIssueStore.getIssueFilePath(issueId)` derives
  `vault/issues/<id>.md`
- patch and transition load their target issue by deriving that path
- dependency resolution also derives the target path from dependency id
- writes persist back to the derived id-based file path

This means query paths are "id-aware", while mutation paths remain "path
derived from id" rather than "path resolved for id".

## Proposed Architecture

### Overview

Introduce an explicit existing-issue locator resolution layer:

- startup scan becomes responsible for discovering issue documents
- projection becomes the authoritative runtime index of `issue_id -> file_path`
- mutation paths resolve an existing issue's current file path from that index
- store APIs stop assuming that the writable path for an existing issue is
  derivable from `issue_id`

### Resolution model

There are two distinct path operations:

1. `getNewIssuePath(issueId)`
   - used only for creation
   - default implementation remains `vault/issues/<id>.md`

2. `resolveExistingIssuePath(issueId)`
   - used for read/patch/transition and dependency loads
   - returns the current file path for an existing issue id
   - fails if no current locator exists

These operations should not share the same implementation, even if they happen
to yield the same path for many issues.

Create also needs a distinct identity operation:

3. `assertCanonicalIssueIdAvailable(issueId)`
   - used only for creation
   - checks whether the canonical `issue.id` already exists anywhere in the
     accepted issue set
   - must not be implemented as "does `vault/issues/<id>.md` exist?"

## Proposed Components

### 1. Existing Issue Path Resolver

Add a dedicated abstraction for locating existing issues by id.

Proposed interface:

```ts
export interface ResolvedIssueLocator {
  startupRelativeFilePath: string;
  absoluteFilePath: string;
}

export interface ExistingIssuePathResolver {
  resolveExistingIssuePath(
    issueId: string,
  ): Promise<ResolvedIssueLocator | null>;
}
```

Optional convenience wrapper:

```ts
export class ProjectionIssuePathResolver implements ExistingIssuePathResolver {
  constructor(options: {
    rootDirectory: string;
    databasePath: string;
  });

  resolveExistingIssuePath(
    issueId: string,
  ): Promise<ResolvedIssueLocator | null>;
}
```

Responsibilities:

- resolve the current locator for a canonical issue id
- convert the projected startup-relative locator into the absolute filesystem
  path needed for IO
- do not synthesize paths from `issueId`
- return `null` when the issue is not known

Non-responsibilities:

- parsing the file
- validating that the file contents match the expected id
- generating new file locations for creates

Contract:

- `startupRelativeFilePath` is the value that appears in `source.file_path` and
  projection rows
- `absoluteFilePath` is the path used by `readFile`, `atomicWriteFile`, and
  snapshot/rollback helpers
- callers must not guess or hand-convert between the two forms outside this
  abstraction

### 2. Filesystem Issue Store split by responsibility

Refactor `FilesystemIssueStore` so existing-issue access and new-issue path
generation are distinct concerns.

Possible shape:

```ts
export interface FilesystemIssueStoreOptions {
  rootDirectory: string;
  existingIssuePathResolver: ExistingIssuePathResolver;
}

export class FilesystemIssueStore {
  getNewIssueFilePath(issueId: string): string;
  readExistingIssue(issueId: string): Promise<{ issue: Issue; locator: ResolvedIssueLocator }>;
  writeExistingIssue(issue: Issue, locator: ResolvedIssueLocator, options?: SerializeIssueMarkdownOptions): Promise<ResolvedIssueLocator>;
  writeNewIssue(issue: Issue, options?: SerializeIssueMarkdownOptions): Promise<string>;
}
```

Required behavior:

- `readExistingIssue(issueId)`:
  - resolve current locator by id
  - parse the resolved absolute file
  - verify parsed frontmatter `id` matches `issueId`
  - return both parsed issue and resolved locator
- `writeExistingIssue(issue, locator)`:
  - persist back to the known existing absolute path
  - do not silently rewrite to `vault/issues/<id>.md`
- `writeNewIssue(issue)`:
  - use the id-based default location for brand-new issues

Important:

- targeted mutation flows should stop calling the startup discovery parser
  directly
- startup discovery parsing and targeted existing-issue parsing are different
  operations, even if they share lower-level Markdown parsing

### 3. Projection-backed locator query

Projection already stores `issues.file_path`. Add a focused resolver-oriented
read helper.

Proposed helper:

```ts
export function readIssueLocator(
  database: Database,
  issueId: string,
): { filePath: string } | null;
```

This helper becomes the storage-backed lookup used by mutation handlers and any
future operational tooling.

Recommendation:

- use projection as the primary runtime resolver
- do not add a silent filesystem scan fallback

Reason:

- silent fallback would recreate read/write split-brain behavior
- if projection is stale enough that resolution fails, callers should get an
  explicit coherence error instead of writing to a guessed path

The helper should continue returning the startup-relative locator stored in
projection. Converting that locator into an absolute filesystem path belongs in
the resolver, which has access to `rootDirectory`.

### 4. Scan-time identity behavior

Startup scan should stop deriving canonical identity from the filename.

New scan behavior:

- parse issue from document contents
- record `source.file_path` exactly as discovered
- accept renamed files whose basename differs from frontmatter `id`
- continue to reject duplicate canonical ids across multiple files

What still gets rejected:

- malformed YAML / invalid issue documents
- duplicate ids
- targeted loads where resolved file contents do not match the requested id

The same duplicate-rejection and accepted-set logic used here must be callable
from mutation-time validation/envelope assembly. Startup scan is the primary
consumer, not the only consumer.

### 5. Mutation behavior

Patch and transition should follow this flow:

1. validate request `issueId`
2. resolve current existing locator by `issueId`
3. parse file at the resolved absolute path
4. assert parsed `issue.id === requested issueId`
5. derive the mutation-time accepted issue set using the same normalization rules
   as startup scan
6. perform validation and mutation against that accepted set
7. persist updated issue back to the same resolved path
8. rebuild or reindex state using that path as the current locator
9. treat rebuild failures as mutation failure and roll back the persisted write

Dependency resolution should use the same approach:

1. resolve dependency `issueId` to current file path
2. parse that file
3. confirm parsed `id` still matches the dependency id

Create should follow this flow:

1. generate or validate the candidate `issue.id`
2. assert canonical id availability by id, not by default file path existence
3. choose `getNewIssuePath(issue.id)` as the initial file location
4. validate the candidate issue against the mutation-time accepted issue set
5. persist the new issue
6. rebuild projection
7. if rebuild reports failures, treat the create as failed and roll back

This gives create two safety rails:

- a pre-persist check that prevents obvious canonical-id collisions
- a post-persist rebuild check that prevents stale-resolution success from
  silently committing an invalid state

### 6. Query behavior

Query responses can stay the same:

- `issue.id` remains the stable client-facing identifier
- `source.file_path` remains the current locator in the returned envelope

The important change is architectural rather than contractual:

- write paths must be able to act on the same returned `issue.id`

## Data Model Implications

### Canonical Markdown

No canonical schema changes are required.

### Projection

Current projection schema already stores:

- `issue_id`
- `file_path`

This is sufficient for the redesign. No new persistent columns are required for
P1 if projection remains the locator source.

### Internal runtime model

The main internal additions are:

- an explicit resolved existing locator carrying both relative and absolute path
  forms
- a shared accepted-issue normalization pipeline reused by startup and mutation
  flows

These can remain local to store/mutation code and do not need to become part of
the public API.

## Discovery Scope Decision

This redesign must make an explicit decision about whether renames include only
file renames within `vault/issues/`, or also moves into subdirectories.

Option A: flat directory only
- keep discovery non-recursive
- allow `schema-foundation.md` instead of `ISSUE-1234.md`
- do not support `vault/issues/area/spec/ISSUE-1234.md`

Option B: recursive discovery
- make scan discover `vault/issues/**/*.md`
- allow both renames and moves
- requires extra updates to discovery, duplicate handling, and likely docs/tests

Recommendation:

- implement Option A first
- treat recursive discovery as a follow-up unless there is a strong product need

Reason:

- P1 can be solved without broadening discovery semantics at the same time
- recursive discovery increases blast radius without changing the core identity
  model

## Failure Modes and Expected Behavior

### Duplicate ids in multiple files

Expected:

- startup scan rejects both files as conflicting
- projection does not surface either conflicting issue as a valid writable item
- mutation-time validation/envelope construction does not treat either file as
  part of the accepted issue set

### Projection knows id but file is missing

Expected:

- mutation resolution fails with a coherence-style not-found or invalid-state
  error
- the system does not guess a fallback path

### Resolver finds file but parsed frontmatter id differs

Expected:

- targeted load fails with deterministic invalid-target error
- mutation does not proceed

### File renamed out-of-band, projection stale

Expected:

- queries may remain stale until rebuild/reindex
- writes should fail explicitly rather than silently recreating a new id-derived
  file

This is preferable because it preserves data integrity and exposes the need for
rebuild/reconciliation.

### Create collides with an existing renamed issue

Expected:

- create checks canonical id availability before choosing the new path
- if a stale projection still allows the write to proceed, post-persist rebuild
  reports the duplicate-id failure
- that rebuild failure causes the mutation to roll back rather than return
  success

## Test Plan

### New acceptance tests

1. Renamed file remains writable
   - canonical file: `vault/issues/schema-foundation.md`
   - frontmatter id: `ISSUE-9999`
   - startup scan indexes it
   - `GET /issues/ISSUE-9999` returns envelope with that `source.file_path`
   - `PATCH /issues/ISSUE-9999` succeeds
   - write lands back in `schema-foundation.md`

2. Renamed dependency remains transition-addressable
   - dependency file name differs from dependency id
   - transition resolution still finds and validates the dependency issue

3. Duplicate ids across different filenames remain rejected
   - two files with same `id`
   - startup rejects both

4. Targeted mismatch still fails
   - resolver points to a file whose frontmatter id differs from requested id
   - patch/transition fail deterministically

5. Create still uses the default id-based path
   - new issue without rename
   - write lands at `vault/issues/<id>.md`

6. Create rejects canonical-id collision even when the conflicting issue lives at
   a renamed path
   - existing file: `vault/issues/schema-foundation.md`
   - frontmatter id: `ISSUE-9999`
   - create for `ISSUE-9999` fails

7. Mutation-time accepted set matches startup accepted set
   - duplicate ids present across two files
   - startup excludes both from projection
   - patch/transition validation and returned envelopes exclude the same files

### Regression tests that must keep passing

- scan/write/rebuild coherence tests
- patch handler tests
- transition handler tests
- filesystem issue store tests
- startup scan tests

## Implementation Sequence

### Phase 1: Add projection-backed path resolution and locator contract

Scope:

- add `readIssueLocator(database, issueId)`
- add resolver implementation
- define the relative/absolute locator contract
- no behavior change yet

Outcome:

- mutation code can depend on a real locator interface before scan behavior
  changes

### Phase 2: Split targeted existing-issue parsing from startup discovery parsing

Scope:

- introduce a targeted existing-issue load path that consumes a resolved locator
- stop patch/transition/dependency loads from calling the startup discovery
  parser directly
- preserve the "resolved file contents must match requested id" check

Outcome:

- renamed existing-issue writes become implementable before startup scan
  semantics change

### Phase 3: Refactor existing-issue read/write flows and shared accepted-set logic

Scope:

- patch and transition resolve current file paths by id
- existing writes persist back to resolved path
- dependency loads use resolver
- startup and mutation paths share one accepted-issue normalization pipeline
- rebuild failures become mutation failures
- create checks canonical id availability by id, not just by default filename

Outcome:

- write path no longer assumes `vault/issues/<id>.md`
- mutation responses stay aligned with projection semantics

### Phase 4: Add coherence tests

Scope:

- renamed-file read/write success
- targeted mismatch still rejected
- duplicate ids still rejected
- create-time canonical-id collision rejected
- mutation accepted set matches startup accepted set

Outcome:

- behavior is proven before scan semantics are relaxed

### Phase 5: Remove filename-derived identity enforcement from startup scan

Scope:

- relax basename/frontmatter-id equality during startup scan
- update startup indexing tests accordingly

Outcome:

- scan, projection, and mutation identity models are finally aligned

## Risks

- using projection for mutation resolution introduces operational dependence on
  projection freshness
- mixing create-path logic and existing-path logic in one store API will keep
  reintroducing identity bugs
- recursive discovery would expand scope materially if folded into the same PR

## Open Questions

1. Should mutation paths fail with `404` or a distinct coherence/invalid-state
   error when projection has no locator for a known issue id?
2. Should startup rebuild be required before writes when projection is missing,
   or should the server refuse to serve writable traffic until projection is
   ready?
3. Do we want to support only filename renames in `vault/issues/`, or also
   subdirectory moves under `vault/issues/**`?
4. Should `FilesystemIssueStore` own locator resolution, or should the resolver
   remain an external dependency passed into mutation workflows?
5. Should create perform canonical-id availability checks purely through
   projection, or through a shared accepted-set scan under the mutation lock
   when projection readiness cannot be guaranteed?

## Recommended First PR

The first implementation PR should not relax startup scan yet.

Recommended first PR scope:

- add projection-backed existing-issue locator resolution
- define the relative/absolute locator contract
- split targeted existing-issue parsing from startup discovery parsing
- refactor patch/transition existing-issue loads to use it
- add renamed-file coherence tests

Why this first:

- it eliminates the write-path assumption before changing scan acceptance rules
- it makes the intermediate state implementable with the current code structure
- it produces a safe intermediate state
- it creates the test harness needed to ship the eventual scan change with
  confidence

The second PR should then:

- add shared accepted-set normalization for startup and mutation flows
- make rebuild failures abort and roll back the mutation
- add create-time canonical-id collision handling
- relax startup scan filename enforcement once the write path is locator-aware
