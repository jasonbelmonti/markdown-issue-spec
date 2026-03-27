import path from "node:path";
import { relativeRepoPath } from "./repo.ts";
import { validateRepository } from "./validate-repo.ts";
import type { FileValidationResult } from "./types.ts";

type Writer = (line: string) => void;

interface CliOptions {
  repoRoot?: string;
  cwd?: string;
  stdout?: Writer;
  stderr?: Writer;
}

export async function runCli(args: string[], options: CliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const parsedArgs = parseArgs(args);

  if ("error" in parsedArgs) {
    stderr(parsedArgs.error);
    stderr(
      "Usage: bun run validate [--fixtures-only | --examples-only] [file-or-directory ...]",
    );
    return 1;
  }

  if (parsedArgs.help) {
    stdout("Usage: bun run validate [--fixtures-only | --examples-only] [file-or-directory ...]");
    return 0;
  }

  if (parsedArgs.paths.length > 0 && (parsedArgs.fixturesOnly || parsedArgs.examplesOnly)) {
    stderr("Scope flags cannot be combined with explicit file or directory paths.");
    return 1;
  }

  let result;

  try {
    result = await validateRepository({
      repoRoot: options.repoRoot,
      fixturesOnly: parsedArgs.fixturesOnly,
      examplesOnly: parsedArgs.examplesOnly,
      markdownPaths: parsedArgs.paths.map((targetPath) =>
        resolveCliPath(targetPath, options.cwd ?? process.cwd()),
      ),
    });
  } catch (error) {
    stderr(formatCliError(error));
    return 1;
  }

  const failures = result.results.filter((entry) => !entry.passedExpectation);

  if (failures.length > 0) {
    stderr("Validation mismatches:");

    for (const failure of failures) {
      stderr(formatFailure(result.repoRoot, failure));
      for (const error of failure.errors) {
        stderr(`  - ${error}`);
      }
    }
  } else {
    stdout("All validation checks matched expectations.");
  }

  stdout("");
  stdout("Summary:");
  stdout(`  valid fixtures: ${formatCounts(result.summary.validFixtures)}`);
  stdout(`  invalid fixtures: ${formatCounts(result.summary.invalidFixtures)}`);
  stdout(`  examples: ${formatCounts(result.summary.examples)}`);

  return result.summary.success ? 0 : 1;
}

function parseArgs(args: string[]):
  | { fixturesOnly: boolean; examplesOnly: boolean; help: boolean; paths: string[] }
  | { error: string } {
  let fixturesOnly = false;
  let examplesOnly = false;
  let help = false;
  const paths: string[] = [];

  for (const arg of args) {
    if (arg === "--fixtures-only") {
      fixturesOnly = true;
      continue;
    }

    if (arg === "--examples-only") {
      examplesOnly = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg.startsWith("-")) {
      return { error: `Unknown argument: ${arg}` };
    }

    paths.push(arg);
  }

  if (fixturesOnly && examplesOnly) {
    return { error: "Choose only one scope flag at a time." };
  }

  return {
    fixturesOnly,
    examplesOnly,
    help,
    paths,
  };
}

function formatFailure(repoRoot: string, result: FileValidationResult): string {
  const expectation = result.expectedToValidate ? "expected valid" : "expected invalid";
  return `- ${relativeRepoPath(repoRoot, result.filePath)} (${expectation})`;
}

function formatCounts(counts: { passed: number; total: number; failed: number }): string {
  return `${counts.passed}/${counts.total} matched expectations (${counts.failed} unexpected)`;
}

function resolveCliPath(targetPath: string, cwd: string): string {
  return path.resolve(cwd, targetPath);
}

function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

if (import.meta.main) {
  const exitCode = await runCli(Bun.argv.slice(2));
  process.exit(exitCode);
}
