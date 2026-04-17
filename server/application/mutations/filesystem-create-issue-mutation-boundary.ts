import { parseCreateIssueCandidate } from "./create-issue-candidate.ts";
import {
  getCreateIssueGraphValidationErrors,
  loadCreateIssueFilesystemState,
  persistCreatedIssueAndBuildEnvelope,
} from "./create-issue-filesystem-state.ts";
import { createIssueId } from "./create-issue-id.ts";
import {
  CreateIssueValidationError,
  toCreateIssueValidationError,
} from "./create-issue-validation-error.ts";
import {
  createFilesystemIssueMutationLock,
  type FilesystemIssueMutationLock,
  withFilesystemIssueMutationLock,
} from "./filesystem-issue-mutation-lock.ts";
import type {
  CreateIssueMutationBoundary,
  CreateIssueMutationCommand,
} from "./issue-mutation-boundary.ts";

export interface FilesystemCreateIssueMutationBoundaryOptions {
  rootDirectory: string;
  issueIdGenerator?: () => string;
  now?: () => string;
  beforePersist?: () => Promise<void>;
  mutationLock?: FilesystemIssueMutationLock;
}

function createTimestamp(): string {
  return new Date().toISOString();
}

export function createFilesystemCreateIssueMutationBoundary(
  options: FilesystemCreateIssueMutationBoundaryOptions,
): CreateIssueMutationBoundary {
  const { rootDirectory } = options;
  const issueIdGenerator = options.issueIdGenerator ?? createIssueId;
  const now = options.now ?? createTimestamp;
  const beforePersist = options.beforePersist;
  const mutationLock = options.mutationLock ?? createFilesystemIssueMutationLock();

  return {
    async createIssue(command: CreateIssueMutationCommand) {
      const indexedAt = now();

      try {
        return await withFilesystemIssueMutationLock(
          mutationLock,
          async () => {
            const issueId = issueIdGenerator();
            const issue = parseCreateIssueCandidate(command.input, issueId);
            const filesystemState = await loadCreateIssueFilesystemState(
              rootDirectory,
              issue.id,
              indexedAt,
            );
            const graphValidationErrors = getCreateIssueGraphValidationErrors(
              filesystemState.currentParsedIssues,
              issue,
              filesystemState.candidateFilePath,
            );

            if (graphValidationErrors.length > 0) {
              throw new CreateIssueValidationError(graphValidationErrors);
            }

            await beforePersist?.();

            const envelope = await persistCreatedIssueAndBuildEnvelope(
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
        const validationError = toCreateIssueValidationError(error);

        if (validationError !== undefined) {
          throw validationError;
        }

        throw error;
      }
    },
  };
}
