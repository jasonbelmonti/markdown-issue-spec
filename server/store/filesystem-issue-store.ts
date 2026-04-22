import { parseIssueMarkdownFile } from "../core/parser/index.ts";
import {
  serializeIssueMarkdown,
  type SerializeIssueMarkdownOptions,
} from "../core/serialize/index.ts";
import type { Issue } from "../core/types/index.ts";
import { atomicWriteFile } from "./atomic-write.ts";
import { getIssueFilePath } from "./issue-file-path.ts";

export interface FilesystemIssueStoreOptions {
  rootDirectory: string;
}

function assertMatchingIssueId(requestedIssueId: string, issue: Issue): void {
  if (issue.id !== requestedIssueId) {
    throw new Error(
      `Issue file for "${requestedIssueId}" contained mismatched frontmatter id "${issue.id}".`,
    );
  }
}

export class FilesystemIssueStore {
  readonly rootDirectory: string;

  constructor(options: FilesystemIssueStoreOptions) {
    this.rootDirectory = options.rootDirectory;
  }

  getIssueFilePath(issueId: string): string {
    return getIssueFilePath(this.rootDirectory, issueId);
  }

  async readIssue(issueId: string): Promise<Issue> {
    const issue = await parseIssueMarkdownFile(this.getIssueFilePath(issueId));

    assertMatchingIssueId(issueId, issue);

    return issue;
  }

  async writeIssue(
    issue: Issue,
    options: SerializeIssueMarkdownOptions = {},
  ): Promise<string> {
    return this.writeIssueAtPath(
      issue,
      this.getIssueFilePath(issue.id),
      options,
    );
  }

  async writeIssueAtPath(
    issue: Issue,
    filePath: string,
    options: SerializeIssueMarkdownOptions = {},
  ): Promise<string> {
    await atomicWriteFile(filePath, serializeIssueMarkdown(issue, options));

    return filePath;
  }
}
