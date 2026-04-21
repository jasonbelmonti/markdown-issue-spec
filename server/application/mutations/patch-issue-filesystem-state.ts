import { join } from "node:path";

import type {
  Issue,
  IssueEnvelope,
  ValidationError,
} from "../../core/types/index.ts";
import { validateIssueGraph } from "../../core/validation/index.ts";
import {
  buildStartupIssueEnvelope,
  listCanonicalIssueFiles,
  parseTargetedIssueFile,
  scanIssueFile,
  ScanIssueFileIdMismatchError,
  toStartupRelativeFilePath,
  type ParsedStartupIssueFile,
} from "../../startup/index.ts";
import {
  FilesystemIssueStore,
  ProjectionIssuePathResolver,
  type ResolvedIssueLocator,
} from "../../store/index.ts";
import { UnsafeIssueIdError } from "../../store/issue-file-path.ts";
import {
  restoreCanonicalIssueSnapshot,
  type CanonicalIssueSnapshot,
} from "./canonical-issue-snapshot.ts";
import { loadResolvedIssueFile } from "./load-resolved-issue-file.ts";
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
  currentIssueLocator: ResolvedIssueLocator;
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

function getTargetIssuePath(
  rootDirectory: string,
  store: FilesystemIssueStore,
  issueId: string,
  currentIssueLocator: ResolvedIssueLocator | null,
): string {
  return (
    currentIssueLocator?.startupRelativeFilePath ??
    toStartupRelativeFilePath(rootDirectory, store.getIssueFilePath(issueId))
  );
}

export async function loadPatchIssueFilesystemState(
  rootDirectory: string,
  issueId: string,
  indexedAt: string,
  databasePath = join(rootDirectory, ".mis", "index.sqlite"),
): Promise<PatchIssueFilesystemState> {
  const store = new FilesystemIssueStore({ rootDirectory });
  const resolver = new ProjectionIssuePathResolver({
    rootDirectory,
    databasePath,
  });
  let loadedIssue: Awaited<
    ReturnType<typeof loadResolvedIssueFile>
  > = null;
  let currentIssueLocator: ResolvedIssueLocator | null = null;

  try {
    loadedIssue = await loadResolvedIssueFile(
      store,
      resolver,
      issueId,
      indexedAt,
    );
    currentIssueLocator = loadedIssue?.issueLocator ?? null;

    if (loadedIssue == null) {
      throw new PatchIssueNotFoundError(issueId);
    }
  } catch (error) {
    if (error instanceof PatchIssueValidationError) {
      throw error;
    }

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

    if (
      error instanceof PatchIssueNotFoundError ||
      (error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw new PatchIssueNotFoundError(issueId);
    }

    if (error instanceof ScanIssueFileIdMismatchError) {
      throw new PatchIssueValidationError([
        createPatchIssueCanonicalValidationError({
          code: "patch.target_issue_invalid",
          path: getTargetIssuePath(
            rootDirectory,
            store,
            issueId,
            currentIssueLocator,
          ),
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
          path: getTargetIssuePath(
            rootDirectory,
            store,
            issueId,
            currentIssueLocator,
          ),
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
    currentParsedIssue: loadedIssue.parsedIssue,
    currentParsedIssues: await loadParsedStartupIssues(rootDirectory, indexedAt),
    currentIssueLocator: loadedIssue.issueLocator,
    canonicalSnapshot: loadedIssue.canonicalSnapshot,
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
  locator: ResolvedIssueLocator,
  issue: Issue,
  indexedAt: string,
): Promise<ParsedStartupIssueFile> {
  const filePath = await store.writeIssueAtPath(
    issue,
    locator.absoluteFilePath,
    {
      updatedAt: {
        mode: "canonical_mutation",
        timestamp: indexedAt,
      },
    },
  );

  return parseTargetedIssueFile({
    filePath,
    startupRelativeFilePath: locator.startupRelativeFilePath,
    indexedAt,
    expectedIssueId: issue.id,
  });
}

export async function persistPatchedIssueAndBuildEnvelope(
  state: PatchIssueFilesystemState,
  issue: Issue,
  indexedAt: string,
): Promise<IssueEnvelope> {
  const persistedIssue = await persistPatchedIssue(
    state.store,
    state.currentIssueLocator,
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
