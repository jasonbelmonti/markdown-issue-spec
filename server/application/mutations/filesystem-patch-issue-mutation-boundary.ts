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
  issueLocks: Map<string, Promise<void>>,
  issueId: string,
  run: () => Promise<T>,
): Promise<T> {
  const previousLock = issueLocks.get(issueId) ?? Promise.resolve();
  let releaseLock!: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  issueLocks.set(issueId, currentLock);
  await previousLock;

  try {
    return await run();
  } finally {
    releaseLock();

    if (issueLocks.get(issueId) === currentLock) {
      issueLocks.delete(issueId);
    }
  }
}

export function createFilesystemPatchIssueMutationBoundary(
  options: FilesystemPatchIssueMutationBoundaryOptions,
): PatchIssueMutationBoundary {
  const { rootDirectory } = options;
  const now = options.now ?? createTimestamp;
  const beforePersist = options.beforePersist;
  const issueLocks = new Map<string, Promise<void>>();

  return {
    async patchIssue(command: PatchIssueMutationCommand) {
      const indexedAt = now();

      try {
        const input = normalizePatchIssueInput(command.input);
        return await withIssueLock(issueLocks, command.issueId, async () => {
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
        });
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
