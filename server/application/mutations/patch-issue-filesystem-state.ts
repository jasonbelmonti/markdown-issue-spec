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
  ScanIssueFileIdMismatchError,
  toStartupRelativeFilePath,
  type ParsedStartupIssueFile,
} from "../../startup/index.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import { UnsafeIssueIdError } from "../../store/issue-file-path.ts";
import {
  readCanonicalIssueSnapshot,
  restoreCanonicalIssueSnapshot,
  type CanonicalIssueSnapshot,
} from "./canonical-issue-snapshot.ts";
import { PatchIssueNotFoundError } from "./patch-issue-not-found-error.ts";
import {
  createPatchIssueCanonicalValidationError,
  createPatchIssueRequestValidationError,
  PatchIssueValidationError,
  toPatchIssueValidationError,
} from "./patch-issue-validation-error.ts";

export interface PatchIssueFilesystemState {
  currentParsedIssue: ParsedStartupIssueFile;
  currentParsedIssues: ParsedStartupIssueFile[];
  canonicalSnapshot: CanonicalIssueSnapshot;
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

export async function loadPatchIssueFilesystemState(
  rootDirectory: string,
  issueId: string,
  indexedAt: string,
): Promise<PatchIssueFilesystemState> {
  const store = new FilesystemIssueStore({ rootDirectory });
  let filePath: string;
  let currentParsedIssue: ParsedStartupIssueFile;

  try {
    filePath = store.getIssueFilePath(issueId);
  } catch (error) {
    if (error instanceof UnsafeIssueIdError) {
      throw new PatchIssueValidationError([
        createPatchIssueRequestValidationError({
          code: "patch.invalid_issue_id",
          path: "/id",
          message: error.message,
          details: {
            issueId: error.issueId,
          },
        }),
      ]);
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
      throw new PatchIssueNotFoundError(issueId);
    }

    if (error instanceof ScanIssueFileIdMismatchError) {
      throw new PatchIssueValidationError([
        createPatchIssueCanonicalValidationError({
          code: "patch.target_issue_invalid",
          path: toStartupRelativeFilePath(rootDirectory, filePath),
          message: error.message,
          details: {
            issueId,
            actualIssueId: error.actualIssueId,
          },
        }),
      ]);
    }

    const validationError = toPatchIssueValidationError(error);

    if (validationError !== undefined) {
      throw validationError;
    }

    if (error instanceof Error) {
      throw new PatchIssueValidationError([
        createPatchIssueCanonicalValidationError({
          code: "patch.target_issue_invalid",
          path: toStartupRelativeFilePath(rootDirectory, filePath),
          message: error.message,
          details: {
            issueId,
          },
        }),
      ]);
    }

    throw error;
  }

  return {
    currentParsedIssue,
    currentParsedIssues: await loadParsedStartupIssues(rootDirectory, indexedAt),
    canonicalSnapshot: await readCanonicalIssueSnapshot(filePath),
    store,
  };
}

export function getPatchIssueGraphValidationErrors(
  currentParsedIssues: readonly ParsedStartupIssueFile[],
  candidateIssue: Issue,
  candidateFilePath: string,
): ValidationError[] {
  return validateIssueGraph([
    ...currentParsedIssues
      .filter((parsedIssue) => parsedIssue.source.file_path !== candidateFilePath)
      .map((parsedIssue) => ({
        issue: parsedIssue.issue,
        file_path: parsedIssue.source.file_path,
      })),
    {
      issue: candidateIssue,
      file_path: candidateFilePath,
    },
  ]).filter((error) => error.file_path === candidateFilePath);
}

function buildPatchedIssueEnvelope(
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

async function persistPatchedIssue(
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

export async function persistPatchedIssueAndBuildEnvelope(
  state: PatchIssueFilesystemState,
  rootDirectory: string,
  issue: Issue,
  indexedAt: string,
): Promise<IssueEnvelope> {
  const persistedIssue = await persistPatchedIssue(
    state.store,
    rootDirectory,
    issue,
    indexedAt,
  );

  return buildPatchedIssueEnvelope(persistedIssue, state.currentParsedIssues);
}

export async function rollbackPatchedIssue(
  state: PatchIssueFilesystemState,
): Promise<void> {
  await restoreCanonicalIssueSnapshot(state.canonicalSnapshot);
}
