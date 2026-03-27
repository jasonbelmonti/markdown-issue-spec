export type ValidationCategory =
  | "valid-fixture"
  | "invalid-fixture"
  | "example"
  | "custom-markdown";

export interface FileValidationResult {
  category: ValidationCategory;
  filePath: string;
  expectedToValidate: boolean;
  schemaValid: boolean | null;
  passedExpectation: boolean;
  errors: string[];
}

export interface ValidationCounts {
  passed: number;
  failed: number;
  total: number;
}

export interface ValidationSummary {
  validFixtures: ValidationCounts;
  invalidFixtures: ValidationCounts;
  examples: ValidationCounts;
  success: boolean;
}

export interface ValidateRepositoryOptions {
  repoRoot?: string;
  fixturesOnly?: boolean;
  examplesOnly?: boolean;
  markdownPaths?: string[];
}

export interface ValidateRepositoryResult {
  repoRoot: string;
  results: FileValidationResult[];
  summary: ValidationSummary;
}
