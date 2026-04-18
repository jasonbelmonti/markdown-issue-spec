import { parseIssueMarkdown } from "../../core/parser/index.ts";
import { serializeIssueMarkdown } from "../../core/serialize/index.ts";
import type { Issue } from "../../core/types/index.ts";
import type { NormalizedTransitionIssueInput } from "./normalize-transition-issue-input.ts";
import {
  createTransitionIssueRequestValidationError,
  createTransitionIssueValidationError,
} from "./transition-issue-validation-error.ts";

function assertStatusChange(
  currentIssue: Issue,
  input: NormalizedTransitionIssueInput,
): void {
  if (input.to_status !== currentIssue.status) {
    return;
  }

  throw createTransitionIssueValidationError(
    createTransitionIssueRequestValidationError({
      code: "transition.noop",
      path: "/to_status",
      message:
        `Transition requests must change the issue status from \`${currentIssue.status}\`.`,
      details: {
        status: currentIssue.status,
      },
    }),
  );
}

function resolveTransitionResolution(
  input: NormalizedTransitionIssueInput,
): Issue["resolution"] | undefined {
  if (input.to_status === "completed") {
    if (input.resolution !== undefined && input.resolution !== "done") {
      throw createTransitionIssueValidationError(
        createTransitionIssueRequestValidationError({
          code: "transition.completed_resolution_must_be_done",
          path: "/resolution",
          message:
            "Transition requests to `completed` must use `resolution: done` when `resolution` is provided.",
          details: {
            to_status: input.to_status,
            resolution: input.resolution,
          },
        }),
      );
    }

    return "done";
  }

  if (input.to_status === "canceled") {
    if (input.resolution === undefined) {
      throw createTransitionIssueValidationError(
        createTransitionIssueRequestValidationError({
          code: "transition.canceled_resolution_required",
          path: "/resolution",
          message:
            "Transition requests to `canceled` must include `resolution`.",
        }),
      );
    }

    if (input.resolution === "done") {
      throw createTransitionIssueValidationError(
        createTransitionIssueRequestValidationError({
          code: "transition.canceled_resolution_cannot_be_done",
          path: "/resolution",
          message:
            "Transition requests to `canceled` must not use `resolution: done`.",
          details: {
            to_status: input.to_status,
            resolution: input.resolution,
          },
        }),
      );
    }

    return input.resolution;
  }

  if (input.resolution !== undefined) {
    throw createTransitionIssueValidationError(
      createTransitionIssueRequestValidationError({
        code: "transition.non_terminal_resolution",
        path: "/resolution",
        message:
          `Transition requests to \`${input.to_status}\` must not include \`resolution\`.`,
        details: {
          to_status: input.to_status,
        },
      }),
    );
  }

  return undefined;
}

export function parseTransitionIssueCandidate(
  currentIssue: Issue,
  input: NormalizedTransitionIssueInput,
): Issue {
  assertStatusChange(currentIssue, input);

  const candidateIssue: Record<string, unknown> = {
    ...currentIssue,
    status: input.to_status,
  };
  const resolution = resolveTransitionResolution(input);

  if (resolution === undefined) {
    delete candidateIssue.resolution;
  } else {
    candidateIssue.resolution = resolution;
  }

  return parseIssueMarkdown(serializeIssueMarkdown(candidateIssue as Issue));
}
