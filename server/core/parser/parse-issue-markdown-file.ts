import type { Issue } from "../types/index.ts";
import { parseMarkdownFrontmatterFile } from "./frontmatter.ts";
import { parseIssueFromMarkdownDocument } from "./parse-issue-markdown.ts";

export async function parseIssueMarkdownFile(filePath: string): Promise<Issue> {
  return parseIssueFromMarkdownDocument(
    await parseMarkdownFrontmatterFile(filePath),
  );
}
