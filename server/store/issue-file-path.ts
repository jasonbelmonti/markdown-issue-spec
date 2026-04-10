import { join } from "node:path";

const ISSUE_DIRECTORY_SEGMENTS = ["vault", "issues"] as const;

function assertSafeIssueId(issueId: string): void {
  if (issueId.length === 0) {
    throw new Error(
      "Issue id must be a non-empty string when building filesystem paths.",
    );
  }

  if (issueId === "." || issueId === "..") {
    throw new Error(
      `Issue id "${issueId}" cannot be "." or ".." when building filesystem paths.`,
    );
  }

  if (issueId.includes("/") || issueId.includes("\\")) {
    throw new Error(
      `Issue id "${issueId}" cannot contain path separators when building filesystem paths.`,
    );
  }
}

export function getIssueFilePath(
  rootDirectory: string,
  issueId: string,
): string {
  assertSafeIssueId(issueId);

  return join(rootDirectory, ...ISSUE_DIRECTORY_SEGMENTS, `${issueId}.md`);
}
