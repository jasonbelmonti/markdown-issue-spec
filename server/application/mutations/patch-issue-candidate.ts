import { parseIssueMarkdown } from "../../core/parser/index.ts";
import { serializeIssueMarkdown } from "../../core/serialize/index.ts";
import type { Issue } from "../../core/types/index.ts";
import type { NormalizedPatchIssueInput } from "./normalize-patch-issue-input.ts";

export function parsePatchIssueCandidate(
  currentIssue: Issue,
  input: NormalizedPatchIssueInput,
): Issue {
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
