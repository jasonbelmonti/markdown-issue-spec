import { access, rm } from "node:fs/promises";

import type {
  Issue,
  IssueEnvelope,
  ValidationError,
} from "../../core/types/index.ts";
import { validateIssueGraph } from "../../core/validation/index.ts";
import {
  buildStartupIssueEnvelope,
  loadAcceptedParsedIssues,
  scanIssueFile,
  type ParsedStartupIssueFile,
  toStartupRelativeFilePath,
} from "../../startup/index.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import {
  createCreateIssueCanonicalValidationError,
  CreateIssueValidationError,
} from "./create-issue-validation-error.ts";

export interface CreateIssueFilesystemState {
  currentParsedIssues: ParsedStartupIssueFile[];
  candidateAbsoluteFilePath: string;
  candidateFilePath: string;
  store: FilesystemIssueStore;
}

async function loadCreateIssueStartupIssues(
  rootDirectory: string,
  indexedAt: string,
): ReturnType<typeof loadAcceptedParsedIssues> {
  return loadAcceptedParsedIssues({
    rootDirectory,
    indexedAt,
  });
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function createIssueIdConflictError(
  filePath: string,
  issueId: string,
): CreateIssueValidationError {
  return new CreateIssueValidationError([
    createCreateIssueCanonicalValidationError({
      code: "create.issue_id_conflict",
      path: filePath,
      message: `Cannot create issue because canonical issue id "${issueId}" already exists.`,
      details: {
        issueId,
      },
    }),
  ]);
}

async function assertCreateIssueIdAvailable(
  store: FilesystemIssueStore,
  rootDirectory: string,
  issueId: string,
  parsedIssues: readonly ParsedStartupIssueFile[],
): Promise<string> {
  const candidateFilePath = store.getIssueFilePath(issueId);
  const conflictingParsedIssue = parsedIssues.find(
    (parsedIssue) => parsedIssue.issue.id === issueId,
  );

  if (conflictingParsedIssue !== undefined) {
    throw createIssueIdConflictError(
      conflictingParsedIssue.source.file_path,
      issueId,
    );
  }

  try {
    await access(candidateFilePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return candidateFilePath;
    }

    throw error;
  }

  throw createIssueIdConflictError(
    toStartupRelativeFilePath(rootDirectory, candidateFilePath),
    issueId,
  );
}

export async function loadCreateIssueFilesystemState(
  rootDirectory: string,
  issueId: string,
  indexedAt: string,
): Promise<CreateIssueFilesystemState> {
  const store = new FilesystemIssueStore({ rootDirectory });
  const {
    parsedIssues,
    acceptedParsedIssues: currentParsedIssues,
  } = await loadCreateIssueStartupIssues(rootDirectory, indexedAt);
  const candidateFilePath = await assertCreateIssueIdAvailable(
    store,
    rootDirectory,
    issueId,
    parsedIssues,
  );

  return {
    currentParsedIssues,
    candidateAbsoluteFilePath: candidateFilePath,
    candidateFilePath: toStartupRelativeFilePath(rootDirectory, candidateFilePath),
    store,
  };
}

export function getCreateIssueGraphValidationErrors(
  currentParsedIssues: readonly ParsedStartupIssueFile[],
  candidateIssue: Issue,
  candidateFilePath: string,
): ValidationError[] {
  return validateIssueGraph([
    ...currentParsedIssues.map((parsedIssue) => ({
      issue: parsedIssue.issue,
      file_path: parsedIssue.source.file_path,
    })),
    {
      issue: candidateIssue,
      file_path: candidateFilePath,
    },
  ]).filter((error) => error.file_path === candidateFilePath);
}

function buildCreatedIssueEnvelope(
  persistedIssue: ParsedStartupIssueFile,
  currentParsedIssues: readonly ParsedStartupIssueFile[],
): IssueEnvelope {
  const parsedIssues = [...currentParsedIssues, persistedIssue];
  const issuesById = new Map(
    parsedIssues.map((parsedIssue) => [parsedIssue.issue.id, parsedIssue.issue] as const),
  );

  return buildStartupIssueEnvelope(persistedIssue, parsedIssues, issuesById);
}

async function persistCreatedIssue(
  store: FilesystemIssueStore,
  rootDirectory: string,
  issue: Issue,
  indexedAt: string,
): Promise<ParsedStartupIssueFile> {
  const filePath = await store.writeIssue(issue);

  return scanIssueFile({
    rootDirectory,
    filePath,
    indexedAt,
  });
}

export async function persistCreatedIssueAndBuildEnvelope(
  state: CreateIssueFilesystemState,
  rootDirectory: string,
  issue: Issue,
  indexedAt: string,
): Promise<IssueEnvelope> {
  const persistedIssue = await persistCreatedIssue(
    state.store,
    rootDirectory,
    issue,
    indexedAt,
  );

  return buildCreatedIssueEnvelope(persistedIssue, state.currentParsedIssues);
}

export async function rollbackCreatedIssue(
  state: CreateIssueFilesystemState,
): Promise<void> {
  await rm(state.candidateAbsoluteFilePath, { force: true });
}
