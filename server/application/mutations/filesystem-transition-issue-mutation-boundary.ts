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
import { prepareTransitionIssueMutation } from "./prepare-transition-issue-mutation.ts";
import {
  toTransitionIssueValidationError,
} from "./transition-issue-validation-error.ts";
import type {
  TransitionIssueMutationBoundary,
  TransitionIssueMutationCommand,
} from "./issue-mutation-boundary.ts";

export interface FilesystemTransitionIssueMutationBoundaryOptions {
  rootDirectory: string;
  now?: () => string;
  beforePersist?: () => Promise<void>;
  afterPersist?: () => Promise<void>;
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
  const afterPersist = options.afterPersist;
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
            const preparedMutation = await prepareTransitionIssueMutation(
              filesystemState,
              command,
              input,
            );

            if (preparedMutation.status === "revision_mismatch") {
              return preparedMutation;
            }

            await beforePersist?.();

            const envelope = await persistTransitionedIssueAndBuildEnvelope(
              filesystemState,
              rootDirectory,
              preparedMutation.issue,
              indexedAt,
            );
            await afterPersist?.();

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
