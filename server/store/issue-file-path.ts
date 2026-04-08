import { join } from "node:path";

const ISSUE_DIRECTORY_SEGMENTS = ["vault", "issues"] as const;

export function getIssueFilePath(
  rootDirectory: string,
  issueId: string,
): string {
  return join(rootDirectory, ...ISSUE_DIRECTORY_SEGMENTS, `${issueId}.md`);
}
