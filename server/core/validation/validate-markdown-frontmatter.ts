import { MarkdownFrontmatterValidationError } from "./error.ts";
import { validateMarkdownFrontmatterProfileRules } from "./profile-rules.ts";
import { validateMarkdownFrontmatterSchema } from "./schema.ts";
import type { FrontmatterValidationError } from "./types.ts";

function compareValidationErrors(
  left: FrontmatterValidationError,
  right: FrontmatterValidationError,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.source.localeCompare(right.source) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function isSamePathOrAncestor(path: string, otherPath: string): boolean {
  if (path === otherPath) {
    return true;
  }

  if (path.length === 0) {
    return otherPath.startsWith("/");
  }

  return otherPath.startsWith(`${path}/`);
}

export function validateMarkdownFrontmatter(
  frontmatter: Record<string, unknown>,
): FrontmatterValidationError[] {
  const profileErrors = validateMarkdownFrontmatterProfileRules(frontmatter);
  const profilePaths = profileErrors.map((error) => error.path);
  const schemaErrors = validateMarkdownFrontmatterSchema(frontmatter).filter((error) => {
    return !profilePaths.some((profilePath) =>
      isSamePathOrAncestor(error.path, profilePath)
    );
  });

  return [...profileErrors, ...schemaErrors].sort(compareValidationErrors);
}

export function assertValidMarkdownFrontmatter(
  frontmatter: Record<string, unknown>,
): void {
  const errors = validateMarkdownFrontmatter(frontmatter);

  if (errors.length === 0) {
    return;
  }

  throw new MarkdownFrontmatterValidationError(errors);
}
