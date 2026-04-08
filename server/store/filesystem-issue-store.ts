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

export class FilesystemIssueStore {
  readonly rootDirectory: string;

  constructor(options: FilesystemIssueStoreOptions) {
    this.rootDirectory = options.rootDirectory;
  }

  getIssueFilePath(issueId: string): string {
    return getIssueFilePath(this.rootDirectory, issueId);
  }

  async readIssue(issueId: string): Promise<Issue> {
    return parseIssueMarkdownFile(this.getIssueFilePath(issueId));
  }

  async writeIssue(
    issue: Issue,
    options: SerializeIssueMarkdownOptions = {},
  ): Promise<string> {
    const filePath = this.getIssueFilePath(issue.id);

    await atomicWriteFile(filePath, serializeIssueMarkdown(issue, options));

    return filePath;
  }
}
