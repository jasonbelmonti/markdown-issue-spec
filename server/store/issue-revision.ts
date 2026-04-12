import { createHash } from "node:crypto";

import type { IssueRevision } from "../core/types/index.ts";

export function computeIssueRevision(source: string): IssueRevision {
  return createHash("sha256").update(source).digest("hex");
}
