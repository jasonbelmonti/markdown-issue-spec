import type { ValidationError } from "../../core/types/index.ts";
import type {
  FrontmatterValidationError,
  SemanticValidationError,
} from "../../core/validation/index.ts";
import {
  IssueSemanticValidationError,
  MarkdownFrontmatterValidationError,
} from "../../core/validation/index.ts";

export type CreateIssueValidationDetail =
  | FrontmatterValidationError
  | SemanticValidationError
  | ValidationError;

export class CreateIssueValidationError extends Error {
  readonly errors: readonly CreateIssueValidationDetail[];

  constructor(errors: readonly CreateIssueValidationDetail[]) {
    super("Issue create validation failed.");
    this.name = "CreateIssueValidationError";
    this.errors = [...errors];
  }
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
