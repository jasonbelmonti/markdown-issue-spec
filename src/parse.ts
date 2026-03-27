import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import yaml from "js-yaml";

export async function parseJsonFile(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source) as unknown;
}

export async function parseMarkdownFrontmatter(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  const parsed = matter(source, {
    engines: {
      yaml: (frontmatter) => yaml.load(frontmatter, { schema: yaml.CORE_SCHEMA }) as object,
    },
  });

  return parsed.data;
}
