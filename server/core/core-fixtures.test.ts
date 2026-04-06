import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";

import { parseIssueMarkdown } from "./parser/index.ts";
import type { CustomIssueRelation, Issue } from "./types/index.ts";
import {
  IssueSemanticValidationError,
  MarkdownFrontmatterValidationError,
  evaluateIssueTransitionGuard,
  type FrontmatterValidationError,
  type SemanticValidationError,
  validateIssueSemantics,
  validateMarkdownFrontmatter,
} from "./validation/index.ts";

const VALID_FIXTURE_DIRECTORY_URL = new URL(
  "../../docs/fixtures/valid/",
  import.meta.url,
);
const INVALID_FIXTURE_DIRECTORY_URL = new URL(
  "../../docs/fixtures/invalid/",
  import.meta.url,
);
const VALID_FIXTURE_DIRECTORY_PATH = fileURLToPath(VALID_FIXTURE_DIRECTORY_URL);
const INVALID_FIXTURE_DIRECTORY_PATH = fileURLToPath(
  INVALID_FIXTURE_DIRECTORY_URL,
);

const INVALID_FIXTURE_BODY = `## Objective

Surface deterministic validation failures.
`;

interface ValidFixtureCase {
  filename: string;
  expectedIssue: Issue;
}

interface InvalidFixtureCase {
  filename: string;
  expectedErrors: FrontmatterValidationError[];
}

const VALID_FIXTURE_CASES = [
  {
    filename: "basic-frontmatter.json",
    expectedIssue: {
      spec_version: "mis/0.1",
      id: "ISSUE-0001",
      title: "Draft the first markdown issue tracking spec",
      kind: "task",
      status: "proposed",
      created_at: "2026-03-22T10:24:00-05:00",
      updated_at: "2026-03-22T10:24:00-05:00",
      priority: "high",
      labels: ["spec", "core"],
      links: [
        {
          rel: "references",
          target: { id: "ISSUE-0009" },
          note: "Background research issue on agent-first workflows",
        },
      ],
      extensions: {
        "acme/story_points": 3,
      },
      body: `## Objective

Exercise the fixture-backed parser gate for the basic issue.
`,
    },
  },
  {
    filename: "dependency-frontmatter.json",
    expectedIssue: {
      spec_version: "mis/0.1",
      id: "ISSUE-0007",
      title: "Define markdown frontmatter profile",
      kind: "task",
      status: "accepted",
      created_at: "2026-03-22T10:24:00-05:00",
      updated_at: "2026-03-22T10:24:00-05:00",
      priority: "high",
      labels: ["spec", "profile", "dependencies"],
      assignees: ["jason"],
      links: [
        {
          rel: "parent",
          target: {
            id: "EPIC-0001",
            href: "../epics/EPIC-0001.md",
          },
        },
        {
          rel: "depends_on",
          target: {
            id: "ISSUE-0002",
            href: "./ISSUE-0002.md",
          },
          required_before: "in_progress",
          note: "ID semantics should be stable before the profile is finalized",
          extensions: {
            "acme/gate": "schema-stability",
          },
        },
        {
          rel: "depends_on",
          target: { id: "ISSUE-0004" },
          required_before: "completed",
          note: "Wait for example corpus review before declaring the profile complete",
        },
        {
          rel: "plugin.example/reviewed_by" as CustomIssueRelation,
          target: {
            id: "ISSUE-0012",
            title: "Indexing strategy work item",
          },
          note: "Custom relation types remain valid when namespaced",
        },
      ],
      extensions: {
        "obsidian/css_class": "profile-issue",
      },
      body: `## Objective

Exercise dependency normalization and transition guards.
`,
    },
  },
  {
    filename: "duplicate-frontmatter.json",
    expectedIssue: {
      spec_version: "mis/0.1",
      id: "ISSUE-0011",
      title: "Consolidate duplicate indexing proposal",
      kind: "task",
      status: "canceled",
      resolution: "duplicate",
      created_at: "2026-03-22T10:24:00-05:00",
      updated_at: "2026-03-22T10:24:00-05:00",
      labels: ["spec", "duplicate"],
      links: [
        {
          rel: "duplicate_of",
          target: { id: "ISSUE-0007" },
          note: "Canonical profile work continues on the primary issue",
        },
      ],
      body: `## Objective

Keep duplicate semantics grounded in the fixture corpus.
`,
    },
  },
] as const satisfies readonly ValidFixtureCase[];

const INVALID_FIXTURE_CASES = [
  {
    filename: "body-key-frontmatter.json",
    expectedErrors: [
      {
        code: "profile.forbidden_frontmatter_field",
        source: "profile",
        path: "/body",
        message:
          "Markdown frontmatter must not declare `body`; use the Markdown document body instead.",
        details: {
          field: "body",
        },
      },
    ],
  },
  {
    filename: "canceled-done-resolution.json",
    expectedErrors: [
      {
        code: "profile.canceled_resolution_cannot_be_done",
        source: "profile",
        path: "/resolution",
        message: "Canceled issues cannot use `resolution: done`.",
        details: {
          status: "canceled",
          resolution: "done",
        },
      },
    ],
  },
  {
    filename: "completed-non-done-resolution.json",
    expectedErrors: [
      {
        code: "profile.completed_resolution_must_be_done",
        source: "profile",
        path: "/resolution",
        message: "Completed issues must use `resolution: done`.",
        details: {
          status: "completed",
          resolution: "superseded",
        },
      },
    ],
  },
  {
    filename: "depends-on-missing-required-before.json",
    expectedErrors: [
      {
        code: "schema.required",
        source: "schema",
        path: "/links/0/required_before",
        message: "Dependency links must declare `required_before`.",
        details: {
          keyword: "required",
          property: "required_before",
          schemaPath: "#/allOf/0/then/required",
        },
      },
    ],
  },
  {
    filename: "description-key-frontmatter.json",
    expectedErrors: [
      {
        code: "profile.forbidden_frontmatter_field",
        source: "profile",
        path: "/description",
        message:
          "Markdown frontmatter must not declare `description`; use the Markdown document body instead.",
        details: {
          field: "description",
        },
      },
    ],
  },
  {
    filename: "non-dependency-with-required-before.json",
    expectedErrors: [
      {
        code: "schema.not",
        source: "schema",
        path: "/links/0/required_before",
        message: "Only `depends_on` links may declare `required_before`.",
        details: {
          keyword: "not",
          schemaPath: "#/allOf/0/else/not",
        },
      },
    ],
  },
  {
    filename: "non-terminal-with-resolution.json",
    expectedErrors: [
      {
        code: "profile.non_terminal_resolution",
        source: "profile",
        path: "/resolution",
        message:
          "Non-terminal issues with status `in_progress` must not declare `resolution`.",
        details: {
          status: "in_progress",
        },
      },
    ],
  },
] as const satisfies readonly InvalidFixtureCase[];

const BASIC_VALID_FIXTURE = VALID_FIXTURE_CASES[0];
const DEPENDENCY_VALID_FIXTURE = VALID_FIXTURE_CASES[1];

function listExpectedFixtureFiles<TCase extends { filename: string }>(
  cases: readonly TCase[],
): string[] {
  return cases.map(({ filename }) => filename);
}

function renderMarkdownIssueDocument(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return `---
${stringifyYaml(frontmatter).trimEnd()}
---

${body}`;
}

function readFixtureBody(testCase: ValidFixtureCase): string {
  if (testCase.expectedIssue.body === undefined) {
    throw new Error(`Fixture ${testCase.filename} must include an expected body.`);
  }

  return testCase.expectedIssue.body;
}

async function listFixtureFiles(directoryPath: string): Promise<string[]> {
  return (await readdir(directoryPath))
    .filter((entry) => entry.endsWith(".json"))
    .sort();
}

async function loadFixtureFrontmatter(
  directoryUrl: URL,
  filename: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(await Bun.file(new URL(filename, directoryUrl)).text()) as Record<
    string,
    unknown
  >;
}

async function parseValidFixture(testCase: ValidFixtureCase): Promise<Issue> {
  const frontmatter = await loadFixtureFrontmatter(
    VALID_FIXTURE_DIRECTORY_URL,
    testCase.filename,
  );

  return parseIssueMarkdown(
    renderMarkdownIssueDocument(frontmatter, readFixtureBody(testCase)),
  );
}

function createInProgressIssue(issue: Issue): Issue {
  return {
    spec_version: issue.spec_version,
    id: issue.id,
    title: issue.title,
    kind: issue.kind,
    status: "in_progress",
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    summary: issue.summary,
    body: issue.body,
    priority: issue.priority,
    labels: issue.labels,
    assignees: issue.assignees,
    links: issue.links,
    extensions: issue.extensions,
  };
}

function captureThrown<TError extends Error>(
  run: () => unknown,
  errorType: new (...args: any[]) => TError,
): TError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(errorType);
    return error as TError;
  }

  throw new Error(`Expected ${errorType.name} to be thrown.`);
}

function createSelfLinkErrors(issueId: string): SemanticValidationError[] {
  return [
    {
      code: "semantic.self_link",
      source: "semantic",
      path: "/links/0/target/id",
      message: "Issue links must not target the source issue itself.",
      details: {
        issueId,
        rel: "references",
        targetIssueId: issueId,
      },
      related_issue_ids: [issueId],
    },
  ];
}

test("fixture-backed suite covers the current fixture inventory", async () => {
  expect(await listFixtureFiles(VALID_FIXTURE_DIRECTORY_PATH)).toEqual(
    listExpectedFixtureFiles(VALID_FIXTURE_CASES),
  );
  expect(await listFixtureFiles(INVALID_FIXTURE_DIRECTORY_PATH)).toEqual(
    listExpectedFixtureFiles(INVALID_FIXTURE_CASES),
  );
});

for (const testCase of VALID_FIXTURE_CASES) {
  test(
    `validateMarkdownFrontmatter accepts valid fixture ${testCase.filename}`,
    async () => {
      const frontmatter = await loadFixtureFrontmatter(
        VALID_FIXTURE_DIRECTORY_URL,
        testCase.filename,
      );

      expect(validateMarkdownFrontmatter(frontmatter)).toEqual([]);
    },
  );

  test(
    `parseIssueMarkdown parses valid fixture ${testCase.filename} with canonical body and normalized links`,
    async () => {
      expect(await parseValidFixture(testCase)).toEqual(testCase.expectedIssue);
    },
  );
}

for (const testCase of INVALID_FIXTURE_CASES) {
  test(
    `validateMarkdownFrontmatter returns deterministic errors for invalid fixture ${testCase.filename}`,
    async () => {
      const frontmatter = await loadFixtureFrontmatter(
        INVALID_FIXTURE_DIRECTORY_URL,
        testCase.filename,
      );

      expect(validateMarkdownFrontmatter(frontmatter)).toEqual(
        testCase.expectedErrors,
      );
    },
  );

  test(
    `parseIssueMarkdown surfaces deterministic validation errors for invalid fixture ${testCase.filename}`,
    async () => {
      const frontmatter = await loadFixtureFrontmatter(
        INVALID_FIXTURE_DIRECTORY_URL,
        testCase.filename,
      );
      const error = captureThrown(
        () =>
          parseIssueMarkdown(
            renderMarkdownIssueDocument(frontmatter, INVALID_FIXTURE_BODY),
          ),
        MarkdownFrontmatterValidationError,
      );

      expect(error.errors).toEqual(testCase.expectedErrors);
    },
  );
}

test("fixture-backed issues surface self-link semantic failures deterministically", async () => {
  const frontmatter = await loadFixtureFrontmatter(
    VALID_FIXTURE_DIRECTORY_URL,
    BASIC_VALID_FIXTURE.filename,
  );
  const issueId = String(frontmatter.id);
  const expectedErrors = createSelfLinkErrors(issueId);
  const semanticError = captureThrown(
    () =>
      parseIssueMarkdown(
        renderMarkdownIssueDocument(
          {
            ...frontmatter,
            links: [
              {
                rel: "references",
                target: issueId,
              },
            ],
          },
          readFixtureBody(BASIC_VALID_FIXTURE),
        ),
      ),
    IssueSemanticValidationError,
  );
  const validIssue = await parseValidFixture(BASIC_VALID_FIXTURE);

  expect(semanticError.errors).toEqual(expectedErrors);
  expect(
    validateIssueSemantics({
      ...validIssue,
      links: [
        {
          rel: "references",
          target: { id: validIssue.id },
        },
      ],
    }),
  ).toEqual(expectedErrors);
});

test("fixture-backed dependency issues allow in_progress once the gated dependency is done", async () => {
  const issue = await parseValidFixture(DEPENDENCY_VALID_FIXTURE);

  expect(
    evaluateIssueTransitionGuard({
      issue,
      next_status: "in_progress",
      known_dependency_issues: [
        {
          spec_version: issue.spec_version,
          id: "ISSUE-0002",
          title: "Schema stability is done",
          kind: issue.kind,
          status: "completed",
          resolution: "done",
          created_at: issue.created_at,
        },
      ],
    }),
  ).toEqual({
    ok: true,
    errors: [],
  });
});

test("fixture-backed dependency issues block completed when the completed gate dependency is not done", async () => {
  const issue = createInProgressIssue(
    await parseValidFixture(DEPENDENCY_VALID_FIXTURE),
  );

  expect(
    evaluateIssueTransitionGuard({
      issue,
      next_status: "completed",
      known_dependency_issues: [
        {
          spec_version: issue.spec_version,
          id: "ISSUE-0004",
          title: "Example corpus review was canceled",
          kind: issue.kind,
          status: "canceled",
          resolution: "duplicate",
          created_at: issue.created_at,
        },
      ],
    }),
  ).toEqual({
    ok: false,
    errors: [
      {
        code: "transition.dependency_not_satisfied",
        source: "transition_guard",
        path: "/links/2/target/id",
        message:
          "Dependency issue ISSUE-0004 must be `completed` with resolution `done` before this issue can transition to `completed`.",
        details: {
          issueId: "ISSUE-0007",
          currentStatus: "in_progress",
          nextStatus: "completed",
          dependencyIssueId: "ISSUE-0004",
          dependencyStatus: "canceled",
          dependencyResolution: "duplicate",
          dependencyRequiredBefore: "completed",
        },
        related_issue_ids: ["ISSUE-0007", "ISSUE-0004"],
      },
    ],
  });
});
