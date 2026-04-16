import { access } from "node:fs/promises";

import type {
  Issue,
  IssueEnvelope,
  ValidationError,
} from "../../core/types/index.ts";
import { validateIssueGraph } from "../../core/validation/index.ts";
import {
  buildStartupIssueEnvelope,
  listCanonicalIssueFiles,
  scanIssueFile,
  toStartupRelativeFilePath,
  type ParsedStartupIssueFile,
} from "../../startup/index.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import {
  createCreateIssueCanonicalValidationError,
  CreateIssueValidationError,
} from "./create-issue-validation-error.ts";

export interface CreateIssueFilesystemState {
  currentParsedIssues: ParsedStartupIssueFile[];
  candidateFilePath: string;
  store: FilesystemIssueStore;
}

async function loadParsedStartupIssues(
  rootDirectory: string,
  indexedAt: string,
): Promise<ParsedStartupIssueFile[]> {
  const issueFilePaths = await listCanonicalIssueFiles(rootDirectory);
  const parsedIssues = await Promise.all(
    issueFilePaths.map((filePath) =>
      scanIssueFile({
        rootDirectory,
        filePath,
        indexedAt,
      }).catch(() => null),
    ),
  );

  return parsedIssues.filter(
    (parsedIssue): parsedIssue is ParsedStartupIssueFile => parsedIssue !== null,
  );
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function assertCreateIssueIdAvailable(
  store: FilesystemIssueStore,
  rootDirectory: string,
  issueId: string,
): Promise<string> {
  const candidateFilePath = store.getIssueFilePath(issueId);

  try {
    await access(candidateFilePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return candidateFilePath;
    }

    throw error;
  }

  throw new CreateIssueValidationError([
    createCreateIssueCanonicalValidationError({
      code: "create.issue_id_conflict",
      path: toStartupRelativeFilePath(rootDirectory, candidateFilePath),
      message: `Cannot create issue because canonical file already exists for "${issueId}".`,
      details: {
        issueId,
      },
    }),
  ]);
}

export async function loadCreateIssueFilesystemState(
  rootDirectory: string,
  issueId: string,
  indexedAt: string,
): Promise<CreateIssueFilesystemState> {
  const store = new FilesystemIssueStore({ rootDirectory });
  const candidateFilePath = await assertCreateIssueIdAvailable(
    store,
    rootDirectory,
    issueId,
  );

  return {
    currentParsedIssues: await loadParsedStartupIssues(rootDirectory, indexedAt),
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
