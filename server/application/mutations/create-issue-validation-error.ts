import type { ValidationError } from "../../core/types/index.ts";
import type {
  FrontmatterValidationError,
  SemanticValidationError,
} from "../../core/validation/index.ts";
import {
  IssueSemanticValidationError,
  MarkdownFrontmatterValidationError,
} from "../../core/validation/index.ts";

export interface CreateIssueRequestValidationError {
  code: string;
  source: "request";
  path: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CreateIssueCanonicalValidationError {
  code: string;
  source: "canonical";
  path: string;
  message: string;
  details?: Record<string, unknown>;
}

export type CreateIssueValidationDetail =
  | FrontmatterValidationError
  | SemanticValidationError
  | ValidationError
  | CreateIssueRequestValidationError
  | CreateIssueCanonicalValidationError;

export class CreateIssueValidationError extends Error {
  readonly errors: readonly CreateIssueValidationDetail[];

  constructor(errors: readonly CreateIssueValidationDetail[]) {
    super("Issue create validation failed.");
    this.name = "CreateIssueValidationError";
    this.errors = [...errors];
  }
}

export function createCreateIssueRequestValidationError(
  input: Omit<CreateIssueRequestValidationError, "source">,
): CreateIssueRequestValidationError {
  return {
    ...input,
    source: "request",
  };
}

export function createCreateIssueRequestValidationFailure(
  input: Omit<CreateIssueRequestValidationError, "source">,
): CreateIssueValidationError {
  return new CreateIssueValidationError([
    createCreateIssueRequestValidationError(input),
  ]);
}

export function createCreateIssueCanonicalValidationError(
  input: Omit<CreateIssueCanonicalValidationError, "source">,
): CreateIssueCanonicalValidationError {
  return {
    ...input,
    source: "canonical",
  };
}

export function toCreateIssueValidationError(
  error: unknown,
): CreateIssueValidationError | undefined {
  if (error instanceof CreateIssueValidationError) {
    return error;
  }

  if (error instanceof MarkdownFrontmatterValidationError) {
    return new CreateIssueValidationError(error.errors);
  }

  if (error instanceof IssueSemanticValidationError) {
    return new CreateIssueValidationError(error.errors);
  }

  return undefined;
}
