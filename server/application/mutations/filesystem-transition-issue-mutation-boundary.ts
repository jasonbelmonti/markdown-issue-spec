import { evaluateIssueTransitionGuard } from "../../core/validation/index.ts";
import {
  createFilesystemIssueMutationLock,
  type FilesystemIssueMutationLock,
  withFilesystemIssueMutationLock,
} from "./filesystem-issue-mutation-lock.ts";
import {
  loadTransitionIssueFilesystemState,
  persistTransitionedIssueAndBuildEnvelope,
} from "./transition-issue-filesystem-state.ts";
import { normalizeTransitionIssueInput } from "./normalize-transition-issue-input.ts";
import { parseTransitionIssueCandidate } from "./transition-issue-candidate.ts";
import {
  toTransitionIssueValidationError,
  TransitionIssueValidationError,
} from "./transition-issue-validation-error.ts";
import type {
  TransitionIssueMutationBoundary,
  TransitionIssueMutationCommand,
} from "./issue-mutation-boundary.ts";

export interface FilesystemTransitionIssueMutationBoundaryOptions {
  rootDirectory: string;
  now?: () => string;
  beforePersist?: () => Promise<void>;
  mutationLock?: FilesystemIssueMutationLock;
}

function createTimestamp(): string {
  return new Date().toISOString();
}

export function createFilesystemTransitionIssueMutationBoundary(
  options: FilesystemTransitionIssueMutationBoundaryOptions,
): TransitionIssueMutationBoundary {
  const { rootDirectory } = options;
  const now = options.now ?? createTimestamp;
  const beforePersist = options.beforePersist;
  const mutationLock = options.mutationLock ?? createFilesystemIssueMutationLock();

  return {
    async transitionIssue(command: TransitionIssueMutationCommand) {
      const indexedAt = now();

      try {
        const input = normalizeTransitionIssueInput(command.input);

        return await withFilesystemIssueMutationLock(
          mutationLock,
          async () => {
            const filesystemState = await loadTransitionIssueFilesystemState(
              rootDirectory,
              command.issueId,
              indexedAt,
            );

            if (
              filesystemState.currentParsedIssue.revision !==
              input.expectedRevision
            ) {
              return {
                status: "revision_mismatch",
                issueId: command.issueId,
                expectedRevision: input.expectedRevision,
                currentRevision: filesystemState.currentParsedIssue.revision,
              } as const;
            }

            const issue = parseTransitionIssueCandidate(
              filesystemState.currentParsedIssue.issue,
              input,
            );
            const guardResult = evaluateIssueTransitionGuard({
              issue: filesystemState.currentParsedIssue.issue,
              next_status: input.to_status,
              known_dependency_issues: filesystemState.currentParsedIssues.map(
                (parsedIssue) => parsedIssue.issue,
              ),
            });

            if (!guardResult.ok) {
              throw new TransitionIssueValidationError(guardResult.errors);
            }

            await beforePersist?.();

            const envelope = await persistTransitionedIssueAndBuildEnvelope(
              filesystemState,
              rootDirectory,
              issue,
              indexedAt,
            );

            return {
              status: "applied",
              issue: envelope.issue,
              envelope,
              revision: envelope.revision,
            } as const;
          },
        );
      } catch (error) {
        const validationError = toTransitionIssueValidationError(error);

        if (validationError !== undefined) {
          throw validationError;
        }

        throw error;
      }
    },
  };
}
