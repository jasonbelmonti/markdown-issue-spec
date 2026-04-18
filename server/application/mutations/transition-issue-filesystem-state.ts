import type {
  Issue,
  IssueEnvelope,
} from "../../core/types/index.ts";
import {
  buildStartupIssueEnvelope,
  listCanonicalIssueFiles,
  scanIssueFile,
  ScanIssueFileIdMismatchError,
  toStartupRelativeFilePath,
  type ParsedStartupIssueFile,
} from "../../startup/index.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import { UnsafeIssueIdError } from "../../store/issue-file-path.ts";
import { TransitionIssueNotFoundError } from "./transition-issue-not-found-error.ts";
import {
  createTransitionIssueCanonicalValidationError,
  createTransitionIssueRequestValidationError,
  createTransitionIssueValidationError,
  toTransitionIssueValidationError,
} from "./transition-issue-validation-error.ts";

export interface TransitionIssueFilesystemState {
  currentParsedIssue: ParsedStartupIssueFile;
  currentParsedIssues: ParsedStartupIssueFile[];
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

function createTargetIssueInvalidError(
  rootDirectory: string,
  filePath: string,
  issueId: string,
  message: string,
  details: Record<string, unknown>,
) {
  return createTransitionIssueValidationError(
    createTransitionIssueCanonicalValidationError({
      code: "transition.target_issue_invalid",
      path: toStartupRelativeFilePath(rootDirectory, filePath),
      message,
      details,
    }),
  );
}

export async function loadTransitionIssueFilesystemState(
  rootDirectory: string,
  issueId: string,
  indexedAt: string,
): Promise<TransitionIssueFilesystemState> {
  const store = new FilesystemIssueStore({ rootDirectory });
  let filePath: string;
  let currentParsedIssue: ParsedStartupIssueFile;

  try {
    filePath = store.getIssueFilePath(issueId);
  } catch (error) {
    if (error instanceof UnsafeIssueIdError) {
      throw createTransitionIssueValidationError(
        createTransitionIssueRequestValidationError({
          code: "transition.invalid_issue_id",
          path: "/id",
          message: error.message,
          details: {
            issueId: error.issueId,
          },
        }),
      );
    }

    throw error;
  }

  try {
    currentParsedIssue = await scanIssueFile({
      rootDirectory,
      filePath,
      indexedAt,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new TransitionIssueNotFoundError(issueId);
    }

    if (error instanceof ScanIssueFileIdMismatchError) {
      throw createTargetIssueInvalidError(
        rootDirectory,
        filePath,
        issueId,
        error.message,
        {
          issueId,
          actualIssueId: error.actualIssueId,
        },
      );
    }

    const validationError = toTransitionIssueValidationError(error);

    if (validationError !== undefined) {
      throw validationError;
    }

    if (error instanceof Error) {
      throw createTargetIssueInvalidError(
        rootDirectory,
        filePath,
        issueId,
        error.message,
        {
          issueId,
        },
      );
    }

    throw error;
  }

  return {
    currentParsedIssue,
    currentParsedIssues: await loadParsedStartupIssues(rootDirectory, indexedAt),
    store,
  };
}

function buildTransitionedIssueEnvelope(
  persistedIssue: ParsedStartupIssueFile,
  currentParsedIssues: readonly ParsedStartupIssueFile[],
): IssueEnvelope {
  const parsedIssues = [
    ...currentParsedIssues.filter(
      (parsedIssue) =>
        parsedIssue.source.file_path !== persistedIssue.source.file_path,
    ),
    persistedIssue,
  ];
  const issuesById = new Map(
    parsedIssues.map((parsedIssue) => [parsedIssue.issue.id, parsedIssue.issue] as const),
  );

  return buildStartupIssueEnvelope(persistedIssue, parsedIssues, issuesById);
}

async function persistTransitionedIssue(
  store: FilesystemIssueStore,
  rootDirectory: string,
  issue: Issue,
  indexedAt: string,
): Promise<ParsedStartupIssueFile> {
  const filePath = await store.writeIssue(issue, {
    updatedAt: {
      mode: "canonical_mutation",
      timestamp: indexedAt,
    },
  });

  return scanIssueFile({
    rootDirectory,
    filePath,
    indexedAt,
  });
}

export async function persistTransitionedIssueAndBuildEnvelope(
  state: TransitionIssueFilesystemState,
  rootDirectory: string,
  issue: Issue,
  indexedAt: string,
): Promise<IssueEnvelope> {
  const persistedIssue = await persistTransitionedIssue(
    state.store,
    rootDirectory,
    issue,
    indexedAt,
  );

  return buildTransitionedIssueEnvelope(persistedIssue, state.currentParsedIssues);
}
