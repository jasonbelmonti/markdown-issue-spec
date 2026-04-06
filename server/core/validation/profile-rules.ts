import type { FrontmatterValidationError } from "./types.ts";

const NON_TERMINAL_STATUSES = new Set([
  "proposed",
  "accepted",
  "in_progress",
]);

function createProfileError(
  code: string,
  path: string,
  message: string,
  details: Record<string, unknown>,
): FrontmatterValidationError {
  return {
    code,
    source: "profile",
    path,
    message,
    details,
  };
}

function createForbiddenFrontmatterFieldError(
  field: "body" | "description",
): FrontmatterValidationError {
  return createProfileError(
    "profile.forbidden_frontmatter_field",
    `/${field}`,
    `Markdown frontmatter must not declare \`${field}\`; use the Markdown document body instead.`,
    { field },
  );
}

export function validateMarkdownFrontmatterProfileRules(
  frontmatter: Record<string, unknown>,
): FrontmatterValidationError[] {
  const errors: FrontmatterValidationError[] = [];

  if ("body" in frontmatter) {
    errors.push(createForbiddenFrontmatterFieldError("body"));
  }

  if ("description" in frontmatter) {
    errors.push(createForbiddenFrontmatterFieldError("description"));
  }

  const status = typeof frontmatter.status === "string" ? frontmatter.status : undefined;
  const resolution =
    typeof frontmatter.resolution === "string" ? frontmatter.resolution : undefined;
  const hasResolution = "resolution" in frontmatter;

  if (status === undefined) {
    return errors;
  }

  switch (status) {
    case "completed":
      if (!hasResolution) {
        errors.push(
          createProfileError(
            "profile.completed_resolution_required",
            "/resolution",
            "Completed issues must declare `resolution: done`.",
            { status },
          ),
        );
        return errors;
      }

      if (resolution !== "done") {
        errors.push(
          createProfileError(
            "profile.completed_resolution_must_be_done",
            "/resolution",
            "Completed issues must use `resolution: done`.",
            {
              status,
              resolution: frontmatter.resolution,
            },
          ),
        );
      }

      return errors;
    case "canceled":
      if (!hasResolution) {
        errors.push(
          createProfileError(
            "profile.canceled_resolution_required",
            "/resolution",
            "Canceled issues must declare a non-`done` `resolution`.",
            { status },
          ),
        );
        return errors;
      }

      if (resolution === "done") {
        errors.push(
          createProfileError(
            "profile.canceled_resolution_cannot_be_done",
            "/resolution",
            "Canceled issues cannot use `resolution: done`.",
            { status, resolution },
          ),
        );
      }

      return errors;
    default:
      if (NON_TERMINAL_STATUSES.has(status) && hasResolution) {
        errors.push(
          createProfileError(
            "profile.non_terminal_resolution",
            "/resolution",
            `Non-terminal issues with status \`${status}\` must not declare \`resolution\`.`,
            { status },
          ),
        );
      }

      return errors;
  }
}
