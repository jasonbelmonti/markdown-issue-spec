import { join } from "node:path";

const ISSUE_DIRECTORY_SEGMENTS = ["vault", "issues"] as const;

export class UnsafeIssueIdError extends Error {
  readonly issueId: string;

  constructor(issueId: string, message: string) {
    super(message);
    this.name = "UnsafeIssueIdError";
    this.issueId = issueId;
  }
}

function assertSafeIssueId(issueId: string): void {
  if (issueId.length === 0) {
    throw new UnsafeIssueIdError(
      issueId,
      "Issue id must be a non-empty string when building filesystem paths.",
    );
  }

  if (issueId === "." || issueId === "..") {
    throw new UnsafeIssueIdError(
      issueId,
      `Issue id "${issueId}" cannot be "." or ".." when building filesystem paths.`,
    );
  }

  if (issueId.includes("/") || issueId.includes("\\")) {
    throw new UnsafeIssueIdError(
      issueId,
      `Issue id "${issueId}" cannot contain path separators when building filesystem paths.`,
    );
  }
}

export function getIssueFilePath(
  rootDirectory: string,
  issueId: string,
): string {
  assertSafeIssueId(issueId);

  return join(getIssueDirectoryPath(rootDirectory), `${issueId}.md`);
}

export function getIssueDirectoryPath(rootDirectory: string): string {
  return join(rootDirectory, ...ISSUE_DIRECTORY_SEGMENTS);
}
