import {
  getPatchIssueGraphValidationErrors,
  loadPatchIssueFilesystemState,
  persistPatchedIssueAndBuildEnvelope,
  rollbackPatchedIssue,
} from "./patch-issue-filesystem-state.ts";
import {
  parsePatchIssueCandidate,
} from "./patch-issue-candidate.ts";
import { normalizePatchIssueInput } from "./normalize-patch-issue-input.ts";
import {
  PatchIssueValidationError,
  toPatchIssueValidationError,
} from "./patch-issue-validation-error.ts";
import {
  createFilesystemIssueMutationLock,
  type FilesystemIssueMutationLock,
  withFilesystemIssueMutationLock,
} from "./filesystem-issue-mutation-lock.ts";
import { finalizePersistedIssueMutation } from "./finalize-persisted-issue-mutation.ts";
import type {
  PatchIssueMutationBoundary,
  PatchIssueMutationCommand,
} from "./issue-mutation-boundary.ts";

export interface FilesystemPatchIssueMutationBoundaryOptions {
  rootDirectory: string;
  now?: () => string;
  beforePersist?: () => Promise<void>;
  afterPersist?: () => Promise<void>;
  mutationLock?: FilesystemIssueMutationLock;
}

function createTimestamp(): string {
  return new Date().toISOString();
}

export function createFilesystemPatchIssueMutationBoundary(
  options: FilesystemPatchIssueMutationBoundaryOptions,
): PatchIssueMutationBoundary {
  const { rootDirectory } = options;
  const now = options.now ?? createTimestamp;
  const beforePersist = options.beforePersist;
  const afterPersist = options.afterPersist;
  const mutationLock = options.mutationLock ?? createFilesystemIssueMutationLock();

  return {
    async patchIssue(command: PatchIssueMutationCommand) {
      const indexedAt = now();

      try {
        const input = normalizePatchIssueInput(command.input);
        return await withFilesystemIssueMutationLock(
          mutationLock,
          async () => {
            const filesystemState = await loadPatchIssueFilesystemState(
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

            const issue = parsePatchIssueCandidate(
              filesystemState.currentParsedIssue.issue,
              input,
            );
            const graphValidationErrors = getPatchIssueGraphValidationErrors(
              filesystemState.currentParsedIssues,
              issue,
              filesystemState.currentParsedIssue.source.file_path,
            );

            if (graphValidationErrors.length > 0) {
              throw new PatchIssueValidationError(graphValidationErrors);
            }

            await beforePersist?.();

            const envelope = await finalizePersistedIssueMutation({
              persist: () =>
                persistPatchedIssueAndBuildEnvelope(
                  filesystemState,
                  rootDirectory,
                  issue,
                  indexedAt,
                ),
              rollback: () => rollbackPatchedIssue(filesystemState),
              afterPersist,
            });

            return {
              status: "applied",
              issue: envelope.issue,
              envelope,
              revision: envelope.revision,
            } as const;
          },
        );
      } catch (error) {
        const validationError = toPatchIssueValidationError(error);

        if (validationError !== undefined) {
          throw validationError;
        }

        throw error;
      }
    },
  };
}
