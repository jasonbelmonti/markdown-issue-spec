import { afterEach, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "./cli.ts";
import { validateRepository } from "./validate-repo.ts";

const repoRoot = path.resolve(import.meta.dir, "..");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe("validateRepository", () => {
  test("validates fixtures with expected pass/fail behavior", async () => {
    const result = await validateRepository({ repoRoot, fixturesOnly: true });

    expect(result.summary.validFixtures.total).toBeGreaterThan(0);
    expect(result.summary.validFixtures.failed).toBe(0);
    expect(result.summary.invalidFixtures.total).toBeGreaterThan(0);
    expect(result.summary.invalidFixtures.failed).toBe(0);
    expect(result.summary.examples.total).toBe(0);
  });

  test("validates every markdown example frontmatter", async () => {
    const result = await validateRepository({ repoRoot, examplesOnly: true });

    expect(result.summary.examples.total).toBeGreaterThan(0);
    expect(result.summary.examples.failed).toBe(0);
    expect(result.summary.validFixtures.total).toBe(0);
    expect(result.summary.invalidFixtures.total).toBe(0);
  });

  test("validates explicit markdown paths outside the repo example directory", async () => {
    const tempRepo = await createTempRepo();
    const markdownPath = path.join(tempRepo, "custom.md");

    await mkdir(path.join(tempRepo, "docs", "schemas"), { recursive: true });
    await copyFile(
      path.join(repoRoot, "docs", "schemas", "markdown-frontmatter.schema.json"),
      path.join(tempRepo, "docs", "schemas", "markdown-frontmatter.schema.json"),
    );
    await writeFile(
      markdownPath,
      `---
spec_version: mis/0.1
id: ISSUE-1000
title: Custom markdown target
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
---

Body`,
    );

    const result = await validateRepository({
      repoRoot: tempRepo,
      markdownPaths: [markdownPath],
    });

    expect(result.summary.examples.total).toBe(1);
    expect(result.summary.examples.failed).toBe(0);
    expect(result.summary.validFixtures.total).toBe(0);
    expect(result.summary.invalidFixtures.total).toBe(0);
  });
});

describe("runCli", () => {
  test("returns nonzero when a known invalid fixture is treated as valid", async () => {
    const tempRepo = await createTempRepo();
    const stdout: string[] = [];
    const stderr: string[] = [];

    await mkdir(path.join(tempRepo, "docs", "schemas"), { recursive: true });
    await mkdir(path.join(tempRepo, "docs", "fixtures", "valid"), { recursive: true });
    await mkdir(path.join(tempRepo, "docs", "fixtures", "invalid"), { recursive: true });
    await mkdir(path.join(tempRepo, "docs", "examples"), { recursive: true });

    await copyFile(
      path.join(repoRoot, "docs", "schemas", "markdown-frontmatter.schema.json"),
      path.join(tempRepo, "docs", "schemas", "markdown-frontmatter.schema.json"),
    );
    await copyFile(
      path.join(repoRoot, "docs", "fixtures", "invalid", "non-terminal-with-resolution.json"),
      path.join(tempRepo, "docs", "fixtures", "valid", "non-terminal-with-resolution.json"),
    );

    const exitCode = await runCli([], {
      repoRoot: tempRepo,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(1);
    expect(stderr.join("\n")).toContain("fixtures/valid/non-terminal-with-resolution.json");
    expect(stdout.join("\n")).toContain("valid fixtures: 0/1 matched expectations");
  });

  test("scope flags limit validation to the requested surface", async () => {
    const fixturesOnlyLines: string[] = [];
    const examplesOnlyLines: string[] = [];

    const fixturesOnlyExitCode = await runCli(["--fixtures-only"], {
      repoRoot,
      stdout: (line) => fixturesOnlyLines.push(line),
      stderr: () => {},
    });
    const examplesOnlyExitCode = await runCli(["--examples-only"], {
      repoRoot,
      stdout: (line) => examplesOnlyLines.push(line),
      stderr: () => {},
    });

    expect(fixturesOnlyExitCode).toBe(0);
    expect(fixturesOnlyLines.join("\n")).toContain("examples: 0/0 matched expectations");

    expect(examplesOnlyExitCode).toBe(0);
    expect(examplesOnlyLines.join("\n")).toContain("valid fixtures: 0/0 matched expectations");
    expect(examplesOnlyLines.join("\n")).toContain("invalid fixtures: 0/0 matched expectations");
  });

  test("accepts a markdown file path and validates only that file", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(["docs/examples/basic-issue.md"], {
      repoRoot,
      cwd: repoRoot,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toHaveLength(0);
    expect(stdout.join("\n")).toContain("examples: 1/1 matched expectations");
    expect(stdout.join("\n")).toContain("valid fixtures: 0/0 matched expectations");
  });

  test("accepts a directory path and validates markdown files recursively", async () => {
    const stdout: string[] = [];
    const exitCode = await runCli(["docs/examples"], {
      repoRoot,
      cwd: repoRoot,
      stdout: (line) => stdout.push(line),
      stderr: () => {},
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain("examples: 3/3 matched expectations");
  });

  test("skips non-markdown files when scanning a directory", async () => {
    const tempRepo = await createTempRepo();
    const markdownDir = path.join(tempRepo, "issues");
    const stdout: string[] = [];
    const stderr: string[] = [];

    await mkdir(path.join(tempRepo, "docs", "schemas"), { recursive: true });
    await mkdir(markdownDir, { recursive: true });
    await copyFile(
      path.join(repoRoot, "docs", "schemas", "markdown-frontmatter.schema.json"),
      path.join(tempRepo, "docs", "schemas", "markdown-frontmatter.schema.json"),
    );
    await writeFile(
      path.join(markdownDir, "issue.md"),
      `---
spec_version: mis/0.1
id: ISSUE-2000
title: Directory markdown target
kind: task
status: proposed
created_at: 2026-03-22T10:24:00-05:00
---

Body`,
    );
    await writeFile(path.join(markdownDir, "notes.txt"), "not markdown");

    const exitCode = await runCli([markdownDir], {
      repoRoot: tempRepo,
      cwd: tempRepo,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toHaveLength(0);
    expect(stdout.join("\n")).toContain("examples: 1/1 matched expectations");
  });

  test("reports missing paths without a stack trace", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(["DOES-NOT-EXIST.md"], {
      repoRoot,
      cwd: repoRoot,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join("\n")).toContain("ENOENT");
    expect(stderr.join("\n")).not.toContain("at runCli");
  });
});

async function createTempRepo(): Promise<string> {
  const tempRepo = await mkdtemp(path.join(os.tmpdir(), "markdown-issue-spec-"));
  tempDirs.push(tempRepo);
  return tempRepo;
}
