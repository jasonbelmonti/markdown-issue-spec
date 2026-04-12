import {
  getPatchIssueGraphValidationErrors,
  loadPatchIssueFilesystemState,
  persistPatchedIssueAndBuildEnvelope,
} from "./patch-issue-filesystem-state.ts";
import {
  parsePatchIssueCandidate,
} from "./patch-issue-candidate.ts";
import { normalizePatchIssueInput } from "./normalize-patch-issue-input.ts";
import {
  PatchIssueValidationError,
  toPatchIssueValidationError,
} from "./patch-issue-validation-error.ts";
import type {
  PatchIssueMutationBoundary,
  PatchIssueMutationCommand,
} from "./issue-mutation-boundary.ts";

export interface FilesystemPatchIssueMutationBoundaryOptions {
  rootDirectory: string;
  now?: () => string;
  beforePersist?: () => Promise<void>;
}

function createTimestamp(): string {
  return new Date().toISOString();
}

async function withIssueLock<T>(
  previousLock: Promise<void>,
  replaceLock: (lock: Promise<void>) => void,
  clearLock: (lock: Promise<void>) => void,
  run: () => Promise<T>,
): Promise<T> {
  let releaseLock!: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  replaceLock(currentLock);
  await previousLock;

  try {
    return await run();
  } finally {
    releaseLock();
    clearLock(currentLock);
  }
}

export function createFilesystemPatchIssueMutationBoundary(
  options: FilesystemPatchIssueMutationBoundaryOptions,
): PatchIssueMutationBoundary {
  const { rootDirectory } = options;
  const now = options.now ?? createTimestamp;
  const beforePersist = options.beforePersist;
  let mutationLock: Promise<void> = Promise.resolve();

  return {
    async patchIssue(command: PatchIssueMutationCommand) {
      const indexedAt = now();

      try {
        const input = normalizePatchIssueInput(command.input);
        return await withIssueLock(
          mutationLock,
          (lock) => {
            mutationLock = lock;
          },
          (lock) => {
            if (mutationLock === lock) {
              mutationLock = Promise.resolve();
            }
          },
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

          const envelope = await persistPatchedIssueAndBuildEnvelope(
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
        const validationError = toPatchIssueValidationError(error);

        if (validationError !== undefined) {
          throw validationError;
        }

        throw error;
      }
    },
  };
}
