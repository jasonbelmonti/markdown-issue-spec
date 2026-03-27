import { parseJsonFile, parseMarkdownFrontmatter } from "./parse.ts";
import { discoverRepoFiles, expandMarkdownTargets, resolveRepoRoot } from "./repo.ts";
import { loadSchemaValidator } from "./schema-validator.ts";
import type {
  FileValidationResult,
  ValidateRepositoryOptions,
  ValidateRepositoryResult,
  ValidationCategory,
  ValidationCounts,
  ValidationSummary,
} from "./types.ts";

export async function validateRepository(
  options: ValidateRepositoryOptions = {},
): Promise<ValidateRepositoryResult> {
  const repoRoot = resolveRepoRoot(options.repoRoot);
  const validator = await loadSchemaValidator(repoRoot);
  const results: FileValidationResult[] = [];
  const markdownPaths = options.markdownPaths ?? [];

  if (markdownPaths.length > 0) {
    const files = await expandMarkdownTargets(markdownPaths);
    ensureTargetsFound(
      files.length,
      "No Markdown files matched the provided path arguments.",
    );

    results.push(
      ...(await Promise.all(
        files.map((filePath) =>
          validateFile({
            category: "custom-markdown",
            expectedToValidate: true,
            filePath,
            parse: parseMarkdownFrontmatter,
            validate: validator.validate,
          }),
        ),
      )),
    );

    return {
      repoRoot,
      results,
      summary: summarizeResults(results),
    };
  }

  const files = await discoverRepoFiles(repoRoot);
  ensureTargetsFound(
    countSelectedRepoTargets(files, options),
    buildEmptyRepoTargetsMessage(options),
  );

  if (!options.examplesOnly) {
    results.push(
      ...(await Promise.all(
        files.validFixtures.map((filePath) =>
          validateFile({
            category: "valid-fixture",
            expectedToValidate: true,
            filePath,
            parse: parseJsonFile,
            validate: validator.validate,
          }),
        ),
      )),
    );

    results.push(
      ...(await Promise.all(
        files.invalidFixtures.map((filePath) =>
          validateFile({
            category: "invalid-fixture",
            expectedToValidate: false,
            filePath,
            parse: parseJsonFile,
            validate: validator.validate,
          }),
        ),
      )),
    );
  }

  if (!options.fixturesOnly) {
    results.push(
      ...(await Promise.all(
        files.examples.map((filePath) =>
          validateFile({
            category: "example",
            expectedToValidate: true,
            filePath,
            parse: parseMarkdownFrontmatter,
            validate: validator.validate,
          }),
        ),
      )),
    );
  }

  return {
    repoRoot,
    results,
    summary: summarizeResults(results),
  };
}

interface ValidateFileArgs {
  category: ValidationCategory;
  expectedToValidate: boolean;
  filePath: string;
  parse: (filePath: string) => Promise<unknown>;
  validate: (data: unknown) => { valid: boolean; errors: string[] };
}

async function validateFile(args: ValidateFileArgs): Promise<FileValidationResult> {
  try {
    const parsed = await args.parse(args.filePath);
    const validation = args.validate(parsed);
    const passedExpectation = args.expectedToValidate
      ? validation.valid
      : !validation.valid;

    const errors =
      validation.valid === args.expectedToValidate
        ? []
        : validation.valid
          ? ["Schema validation unexpectedly passed."]
          : validation.errors;

    return {
      category: args.category,
      filePath: args.filePath,
      expectedToValidate: args.expectedToValidate,
      schemaValid: validation.valid,
      passedExpectation,
      errors,
    };
  } catch (error) {
    return {
      category: args.category,
      filePath: args.filePath,
      expectedToValidate: args.expectedToValidate,
      schemaValid: null,
      passedExpectation: false,
      errors: [formatThrownError(error)],
    };
  }
}

function summarizeResults(results: FileValidationResult[]): ValidationSummary {
  const validFixtures = createCounts(
    results.filter((result) => result.category === "valid-fixture"),
  );
  const invalidFixtures = createCounts(
    results.filter((result) => result.category === "invalid-fixture"),
  );
  const examples = createCounts(results.filter((result) => result.category === "example"));
  const customMarkdown = createCounts(
    results.filter((result) => result.category === "custom-markdown"),
  );

  return {
    validFixtures,
    invalidFixtures,
    examples: {
      passed: examples.passed + customMarkdown.passed,
      failed: examples.failed + customMarkdown.failed,
      total: examples.total + customMarkdown.total,
    },
    success:
      validFixtures.failed === 0 &&
      invalidFixtures.failed === 0 &&
      examples.failed === 0 &&
      customMarkdown.failed === 0,
  };
}

function createCounts(results: FileValidationResult[]): ValidationCounts {
  const passed = results.filter((result) => result.passedExpectation).length;
  return {
    passed,
    failed: results.length - passed,
    total: results.length,
  };
}

function formatThrownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function countSelectedRepoTargets(
  files: { validFixtures: string[]; invalidFixtures: string[]; examples: string[] },
  options: ValidateRepositoryOptions,
): number {
  const fixtureCount = options.examplesOnly
    ? 0
    : files.validFixtures.length + files.invalidFixtures.length;
  const exampleCount = options.fixturesOnly ? 0 : files.examples.length;
  return fixtureCount + exampleCount;
}

function buildEmptyRepoTargetsMessage(options: ValidateRepositoryOptions): string {
  if (options.fixturesOnly) {
    return "No fixture files were found under docs/fixtures for the selected scope.";
  }

  if (options.examplesOnly) {
    return "No Markdown example files were found under docs/examples for the selected scope.";
  }

  return "No validation targets were found under docs/fixtures or docs/examples.";
}

function ensureTargetsFound(totalTargets: number, message: string): void {
  if (totalTargets === 0) {
    throw new Error(message);
  }
}
