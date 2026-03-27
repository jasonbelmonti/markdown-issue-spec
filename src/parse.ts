import { readFile } from "node:fs/promises";
import matter from "gray-matter";

const TIMESTAMP_FIELDS = new Set(["created_at", "updated_at"]);

export async function parseJsonFile(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source) as unknown;
}

export async function parseMarkdownFrontmatter(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  const parsed = matter(source);
  return normalizeYamlValue(parsed.data, extractTimestampLexemes(extractRawFrontmatter(source)));
}

function normalizeYamlValue(value: unknown, timestampLexemes: Map<string, string>, path: string[] = []): unknown {
  if (value instanceof Date) {
    const fieldName = path.length === 1 ? path[0] : undefined;
    return fieldName ? timestampLexemes.get(fieldName) ?? value.toISOString() : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeYamlValue(entry, timestampLexemes, path));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeYamlValue(entry, timestampLexemes, [...path, key]),
      ]),
    );
  }

  return value;
}

function extractTimestampLexemes(rawFrontmatter: string): Map<string, string> {
  const lexemes = new Map<string, string>();

  for (const fieldName of TIMESTAMP_FIELDS) {
    const match = rawFrontmatter.match(new RegExp(`^${fieldName}:\\s*(.+?)\\s*$`, "m"));
    if (match) {
      lexemes.set(fieldName, match[1]);
    }
  }

  return lexemes;
}

function extractRawFrontmatter(source: string): string {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/);
  return match?.[1] ?? "";
}
