import { expect, test } from "bun:test";
import { stringify as stringifyYaml } from "yaml";

import {
  parseIssueMarkdown,
  parseMarkdownFrontmatterDocument,
} from "../parser/index.ts";
import type { Issue } from "../types/index.ts";
import { serializeIssueMarkdown } from "./index.ts";

const VALID_FIXTURE_DIRECTORY_URL = new URL(
  "../../../docs/fixtures/valid/",
  import.meta.url,
);

interface ValidFixtureCase {
  filename: string;
  body: string;
}

const VALID_FIXTURE_CASES = [
  {
    filename: "basic-frontmatter.json",
    body: `## Objective

Exercise the fixture-backed parser gate for the basic issue.
`,
  },
  {
    filename: "dependency-frontmatter.json",
    body: `## Objective

Exercise dependency normalization and transition guards.
`,
  },
  {
    filename: "duplicate-frontmatter.json",
    body: `## Objective

Keep duplicate semantics grounded in the fixture corpus.
`,
  },
] as const satisfies readonly ValidFixtureCase[];

function renderMarkdownIssueDocument(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return `---
${stringifyYaml(frontmatter).trimEnd()}
---

${body}`;
}

async function loadFixtureFrontmatter(
  filename: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await Bun.file(new URL(filename, VALID_FIXTURE_DIRECTORY_URL)).text(),
  ) as Record<string, unknown>;
}

async function loadFixtureIssue(testCase: ValidFixtureCase): Promise<Issue> {
  return parseIssueMarkdown(
    renderMarkdownIssueDocument(
      await loadFixtureFrontmatter(testCase.filename),
      testCase.body,
    ),
  );
}

function stripUpdatedAt(issue: Issue): Issue {
  const { updated_at: _updatedAt, ...rest } = issue;
  return rest as Issue;
}

for (const testCase of VALID_FIXTURE_CASES) {
  test(
    `serializeIssueMarkdown round-trips valid fixture ${testCase.filename}`,
    async () => {
      const issue = await loadFixtureIssue(testCase);

      expect(parseIssueMarkdown(serializeIssueMarkdown(issue))).toEqual(issue);
    },
  );
}

test(
  "serializeIssueMarkdown keeps canonical body out of frontmatter and uses shorthand targets for bare ids",
  async () => {
    const issue = await loadFixtureIssue(VALID_FIXTURE_CASES[1]);
    const document = parseMarkdownFrontmatterDocument(
      serializeIssueMarkdown(issue),
    );
    const links = document.frontmatter.links as Array<Record<string, unknown>>;

    expect(document.frontmatter.body).toBeUndefined();
    expect(document.body).toBe(issue.body);
    expect(links[1]?.target).toEqual({
      id: "ISSUE-0002",
      href: "./ISSUE-0002.md",
    });
    expect(links[2]?.target).toBe("ISSUE-0004");
  },
);

test(
  "serializeIssueMarkdown preserves updated_at by default for serialization-only rewrites",
  async () => {
    const issue = await loadFixtureIssue(VALID_FIXTURE_CASES[0]);
    const document = parseMarkdownFrontmatterDocument(
      serializeIssueMarkdown(issue),
    );

    expect(document.frontmatter.updated_at).toBe(issue.updated_at);
  },
);

test(
  "serializeIssueMarkdown treats an empty updatedAt policy object as preserve mode",
  async () => {
    const issue = await loadFixtureIssue(VALID_FIXTURE_CASES[0]);
    const document = parseMarkdownFrontmatterDocument(
      serializeIssueMarkdown(issue, {
        updatedAt: {},
      }),
    );

    expect(document.frontmatter.updated_at).toBe(issue.updated_at);
  },
);

test(
  "serializeIssueMarkdown updates updated_at for canonical mutations when it is already present",
  async () => {
    const issue = await loadFixtureIssue(VALID_FIXTURE_CASES[0]);
    const timestamp = "2026-04-07T09:15:00-05:00";
    const document = parseMarkdownFrontmatterDocument(
      serializeIssueMarkdown(issue, {
        updatedAt: {
          mode: "canonical_mutation",
          timestamp,
        },
      }),
    );

    expect(document.frontmatter.updated_at).toBe(timestamp);
  },
);

test(
  "serializeIssueMarkdown can add updated_at on the first canonical mutation",
  async () => {
    const timestamp = "2026-04-07T09:30:00-05:00";
    const issue = stripUpdatedAt(await loadFixtureIssue(VALID_FIXTURE_CASES[0]));
    const document = parseMarkdownFrontmatterDocument(
      serializeIssueMarkdown(issue, {
        updatedAt: {
          mode: "canonical_mutation",
          timestamp,
        },
      }),
    );

    expect(document.frontmatter.updated_at).toBe(timestamp);
  },
);

test(
  "serializeIssueMarkdown can leave updated_at absent when first-mutation backfill is disabled",
  async () => {
    const timestamp = "2026-04-07T09:45:00-05:00";
    const issue = stripUpdatedAt(await loadFixtureIssue(VALID_FIXTURE_CASES[1]));
    const document = parseMarkdownFrontmatterDocument(
      serializeIssueMarkdown(issue, {
        updatedAt: {
          mode: "canonical_mutation",
          timestamp,
          addIfMissing: false,
        },
      }),
    );

    expect(document.frontmatter.updated_at).toBeUndefined();
  },
);
