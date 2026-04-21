import { readFile } from "node:fs/promises";

import { atomicWriteFile } from "../../store/atomic-write.ts";

export interface CanonicalIssueSnapshot {
  filePath: string;
  originalSource: string;
}

export async function readCanonicalIssueSnapshot(
  filePath: string,
): Promise<CanonicalIssueSnapshot> {
  return {
    filePath,
    originalSource: await readFile(filePath, "utf8"),
  };
}

export async function restoreCanonicalIssueSnapshot(
  snapshot: CanonicalIssueSnapshot,
): Promise<void> {
  await atomicWriteFile(snapshot.filePath, snapshot.originalSource);
}
