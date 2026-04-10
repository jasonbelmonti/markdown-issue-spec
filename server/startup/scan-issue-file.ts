import { createHash } from "node:crypto";
import { relative, sep } from "node:path";

import { parseIssueMarkdown } from "../core/parser/index.ts";
import type { Rfc3339Timestamp } from "../core/types/index.ts";
import type { ParsedStartupIssueFile } from "./startup-envelope.ts";

function hashIssueSource(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function toStartupRelativeFilePath(
  rootDirectory: string,
  filePath: string,
): string {
  return relative(rootDirectory, filePath).split(sep).join("/");
}

export interface ScanIssueFileOptions {
  rootDirectory: string;
  filePath: string;
  indexedAt: Rfc3339Timestamp;
}

export async function scanIssueFile(
  options: ScanIssueFileOptions,
): Promise<ParsedStartupIssueFile> {
  const source = await Bun.file(options.filePath).text();
  const issue = parseIssueMarkdown(source);

  return {
    issue,
    revision: hashIssueSource(source),
    source: {
      file_path: toStartupRelativeFilePath(
        options.rootDirectory,
        options.filePath,
      ),
      indexed_at: options.indexedAt,
    },
  };
}
