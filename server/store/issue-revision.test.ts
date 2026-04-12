import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { computeIssueRevision } from "./issue-revision.ts";

const ISSUE_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-0200
title: Extract the canonical issue revision helper
kind: task
status: proposed
created_at: 2026-04-12T06:27:00-05:00
---
## Objective

Keep startup scan and mutations on the same revision algorithm.
`;

test("computeIssueRevision matches the startup scan sha256 source hash", () => {
  expect(computeIssueRevision(ISSUE_SOURCE)).toBe(
    createHash("sha256").update(ISSUE_SOURCE).digest("hex"),
  );
});

test("computeIssueRevision treats raw markdown changes as revision changes", () => {
  expect(computeIssueRevision(`${ISSUE_SOURCE}\n`)).not.toBe(
    computeIssueRevision(ISSUE_SOURCE),
  );
});
