import type { ValidationError } from "../../core/types/index.ts";
import type {
  FrontmatterValidationError,
  SemanticValidationError,
} from "../../core/validation/index.ts";
import {
  IssueSemanticValidationError,
  MarkdownFrontmatterValidationError,
} from "../../core/validation/index.ts";

export interface PatchIssueRequestValidationError {
  code: string;
  source: "request";
  path: string;
  message: string;
  details?: Record<string, unknown>;
}

export type PatchIssueValidationDetail =
  | FrontmatterValidationError
  | SemanticValidationError
  | ValidationError
  | PatchIssueRequestValidationError;

export class PatchIssueValidationError extends Error {
  readonly errors: readonly PatchIssueValidationDetail[];

  constructor(errors: readonly PatchIssueValidationDetail[]) {
    super("Issue patch validation failed.");
    this.name = "PatchIssueValidationError";
    this.errors = [...errors];
  }
}

export function createPatchIssueRequestValidationError(
  input: Omit<PatchIssueRequestValidationError, "source">,
): PatchIssueRequestValidationError {
  return {
    ...input,
    source: "request",
  };
}

export function toPatchIssueValidationError(
  error: unknown,
): PatchIssueValidationError | undefined {
  if (error instanceof PatchIssueValidationError) {
    return error;
  }

  if (error instanceof MarkdownFrontmatterValidationError) {
    return new PatchIssueValidationError(error.errors);
  }

  if (error instanceof IssueSemanticValidationError) {
    return new PatchIssueValidationError(error.errors);
  }

  return undefined;
}
