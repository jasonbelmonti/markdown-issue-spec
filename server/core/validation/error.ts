import type { FrontmatterValidationError } from "./types.ts";

function formatPath(path: string): string {
  return path.length === 0 ? "<frontmatter>" : path;
}

export function formatFrontmatterValidationErrors(
  errors: readonly FrontmatterValidationError[],
): string {
  if (errors.length === 0) {
    return "Markdown frontmatter validation failed.";
  }

  if (errors.length === 1) {
    return errors[0]!.message;
  }

  return [
    "Markdown frontmatter validation failed:",
    ...errors.map((error) => `- ${formatPath(error.path)}: ${error.message}`),
  ].join("\n");
}

export class MarkdownFrontmatterValidationError extends Error {
  readonly errors: readonly FrontmatterValidationError[];

  constructor(errors: readonly FrontmatterValidationError[]) {
    super(formatFrontmatterValidationErrors(errors));
    this.name = "MarkdownFrontmatterValidationError";
    this.errors = [...errors];
  }
}
