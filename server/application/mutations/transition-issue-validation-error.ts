import type {
  FrontmatterValidationError,
  SemanticValidationError,
  TransitionGuardError,
} from "../../core/validation/index.ts";
import {
  IssueSemanticValidationError,
  MarkdownFrontmatterValidationError,
} from "../../core/validation/index.ts";

export interface TransitionIssueRequestValidationError {
  code: string;
  source: "request";
  path: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface TransitionIssueCanonicalValidationError {
  code: string;
  source: "canonical";
  path: string;
  message: string;
  details?: Record<string, unknown>;
}

export type TransitionIssueValidationDetail =
  | FrontmatterValidationError
  | SemanticValidationError
  | TransitionGuardError
  | TransitionIssueCanonicalValidationError
  | TransitionIssueRequestValidationError;

export class TransitionIssueValidationError extends Error {
  readonly errors: readonly TransitionIssueValidationDetail[];

  constructor(errors: readonly TransitionIssueValidationDetail[]) {
    super("Issue transition validation failed.");
    this.name = "TransitionIssueValidationError";
    this.errors = [...errors];
  }
}

export function createTransitionIssueRequestValidationError(
  input: Omit<TransitionIssueRequestValidationError, "source">,
): TransitionIssueRequestValidationError {
  return {
    ...input,
    source: "request",
  };
}

export function createTransitionIssueCanonicalValidationError(
  input: Omit<TransitionIssueCanonicalValidationError, "source">,
): TransitionIssueCanonicalValidationError {
  return {
    ...input,
    source: "canonical",
  };
}

export function createTransitionIssueValidationError(
  error: TransitionIssueValidationDetail,
): TransitionIssueValidationError {
  return new TransitionIssueValidationError([error]);
}

export function toTransitionIssueValidationError(
  error: unknown,
): TransitionIssueValidationError | undefined {
  if (error instanceof TransitionIssueValidationError) {
    return error;
  }

  if (error instanceof MarkdownFrontmatterValidationError) {
    return new TransitionIssueValidationError(error.errors);
  }

  if (error instanceof IssueSemanticValidationError) {
    return new TransitionIssueValidationError(error.errors);
  }

  return undefined;
}
