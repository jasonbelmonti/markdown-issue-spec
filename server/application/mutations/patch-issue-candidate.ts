import { parseIssueMarkdown } from "../../core/parser/index.ts";
import { serializeIssueMarkdown } from "../../core/serialize/index.ts";
import type { Issue } from "../../core/types/index.ts";
import type { NormalizedPatchIssueInput } from "./normalize-patch-issue-input.ts";
import {
  createPatchIssueRequestValidationError,
  PatchIssueValidationError,
} from "./patch-issue-validation-error.ts";

function assertResolutionUsage(
  currentIssue: Issue,
  input: NormalizedPatchIssueInput,
): void {
  if (!input.providedFields.has("resolution")) {
    return;
  }

  const nextStatus = input.status ?? currentIssue.status;

  if (nextStatus === "completed" || nextStatus === "canceled") {
    return;
  }

  throw new PatchIssueValidationError([
    createPatchIssueRequestValidationError({
      code: "patch.non_terminal_resolution",
      path: "/resolution",
      message:
        `Patch requests must not include \`resolution\` when the issue status remains \`${nextStatus}\`.`,
      details: {
        status: nextStatus,
      },
    }),
  ]);
}

export function parsePatchIssueCandidate(
  currentIssue: Issue,
  input: NormalizedPatchIssueInput,
): Issue {
  assertResolutionUsage(currentIssue, input);

  const candidateIssue: Record<string, unknown> = {
    ...currentIssue,
  };

  for (const fieldName of input.providedFields) {
    candidateIssue[fieldName] = input[fieldName];
  }

  if (
    input.providedFields.has("status") &&
    input.status !== "completed" &&
    input.status !== "canceled" &&
    !input.providedFields.has("resolution")
  ) {
    delete candidateIssue.resolution;
  }

  return parseIssueMarkdown(serializeIssueMarkdown(candidateIssue as Issue));
}
