import { parse as parseYaml } from "yaml";

import { isPlainObject } from "./record-helpers.ts";

export interface SplitMarkdownFrontmatterResult {
  frontmatterSource: string;
  body?: string;
}

export interface ParsedMarkdownFrontmatterDocument {
  frontmatter: Record<string, unknown>;
  body?: string;
}

const FRONTMATTER_PATTERN =
  /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitMarkdownFrontmatter(
  source: string,
): SplitMarkdownFrontmatterResult {
  const match = source.match(FRONTMATTER_PATTERN);

  if (!match) {
    throw new Error("Markdown issue document is missing YAML frontmatter.");
  }

  const frontmatterSource = match[1] ?? "";
  let body = source.slice(match[0].length);

  // Strip the conventional separator newline between the closing fence and the
  // document body while preserving the rest of the Markdown verbatim.
  if (body.startsWith("\r\n")) {
    body = body.slice(2);
  } else if (body.startsWith("\n")) {
    body = body.slice(1);
  }

  return {
    frontmatterSource,
    body: body.length > 0 ? body : undefined,
  };
}

export function parseMarkdownFrontmatterDocument(
  source: string,
): ParsedMarkdownFrontmatterDocument {
  const { frontmatterSource, body } = splitMarkdownFrontmatter(source);

  let frontmatter: unknown;

  try {
    frontmatter = parseYaml(frontmatterSource);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse YAML frontmatter: ${message}`);
  }

  if (!isPlainObject(frontmatter)) {
    throw new Error("YAML frontmatter must parse to an object.");
  }

  return { frontmatter, body };
}

export async function parseMarkdownFrontmatterFile(
  filePath: string,
): Promise<ParsedMarkdownFrontmatterDocument> {
  const source = await Bun.file(filePath).text();
  return parseMarkdownFrontmatterDocument(source);
}
