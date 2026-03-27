import { readFile } from "node:fs/promises";
import matter from "gray-matter";

export async function parseJsonFile(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source) as unknown;
}

export async function parseMarkdownFrontmatter(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  const parsed = matter(source);
  return normalizeYamlValue(parsed.data);
}

function normalizeYamlValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeYamlValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeYamlValue(entry)]),
    );
  }

  return value;
}
