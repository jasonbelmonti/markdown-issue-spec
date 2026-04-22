import { join } from "node:path";

import type {
  Issue,
  IssueEnvelope,
} from "../../core/types/index.ts";
import { findRelevantDependencyLinks } from "../../core/validation/index.ts";
import {
  buildStartupIssueEnvelope,
  loadAcceptedParsedIssues,
  parseTargetedIssueFile,
  ScanIssueFileIdMismatchError,
  toStartupRelativeFilePath,
  type ParsedStartupIssueFile,
} from "../../startup/index.ts";
import {
  FilesystemIssueStore,
  ProjectionIssuePathResolver,
  type ExistingIssuePathResolver,
  type ResolvedIssueLocator,
} from "../../store/index.ts";
import { UnsafeIssueIdError } from "../../store/issue-file-path.ts";
import {
  restoreCanonicalIssueSnapshot,
  type CanonicalIssueSnapshot,
} from "./canonical-issue-snapshot.ts";
import { loadResolvedIssueFile } from "./load-resolved-issue-file.ts";
import { TransitionIssueNotFoundError } from "./transition-issue-not-found-error.ts";
import {
  createTransitionIssueCanonicalValidationError,
  createTransitionIssueRequestValidationError,
  createTransitionIssueValidationError,
  TransitionIssueValidationError,
  toTransitionIssueValidationError,
} from "./transition-issue-validation-error.ts";

export interface TransitionIssueFilesystemState {
  currentParsedIssue: ParsedStartupIssueFile;
  currentParsedIssues: ParsedStartupIssueFile[];
  currentIssueLocator: ResolvedIssueLocator;
  canonicalSnapshot: CanonicalIssueSnapshot;
  loadDependencyIssues: (nextStatus: "in_progress" | "completed") => Promise<Issue[]>;
  store: FilesystemIssueStore;
}

async function loadParsedStartupIssues(
  rootDirectory: string,
  indexedAt: string,
): Promise<ParsedStartupIssueFile[]> {
  const { acceptedParsedIssues } = await loadAcceptedParsedIssues({
    rootDirectory,
    indexedAt,
  });

  return acceptedParsedIssues;
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

function createDependencyIssueValidationError(
  code: "transition.dependency_issue_not_found" | "transition.dependency_issue_invalid",
  index: number,
  dependencyIssueId: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return createTransitionIssueValidationError(
    createTransitionIssueCanonicalValidationError({
      code,
      path: `/links/${index}/target/id`,
      message,
      details: {
        dependencyIssueId,
        ...details,
      },
    }),
  );
}

function getTargetIssueFilePath(
  store: FilesystemIssueStore,
  issueId: string,
  currentIssueLocator: ResolvedIssueLocator | null,
): string {
  return currentIssueLocator?.absoluteFilePath ?? store.getIssueFilePath(issueId);
}

function isAcceptedIssueAtResolvedPath(
  currentParsedIssues: readonly ParsedStartupIssueFile[],
  issueId: string,
  issueLocator: ResolvedIssueLocator,
): boolean {
  return currentParsedIssues.some(
    (parsedIssue) =>
      parsedIssue.issue.id === issueId &&
      parsedIssue.source.file_path === issueLocator.startupRelativeFilePath,
  );
}

async function loadDependencyIssues(
  indexedAt: string,
  resolver: ExistingIssuePathResolver,
  store: FilesystemIssueStore,
  currentParsedIssues: readonly ParsedStartupIssueFile[],
  issue: Issue,
  nextStatus: "in_progress" | "completed",
): Promise<Issue[]> {
  const dependencyIssuesById = new Map<string, Issue>();

  for (const { index, link } of findRelevantDependencyLinks(issue, nextStatus)) {
    if (dependencyIssuesById.has(link.target.id)) {
      continue;
    }

    let dependencyLocator: ResolvedIssueLocator | null = null;

    try {
      store.getIssueFilePath(link.target.id);
      dependencyLocator = await resolver.resolveExistingIssuePath(link.target.id);

      if (dependencyLocator == null) {
        const notFoundError = new Error(
          `Dependency issue ${link.target.id} could not be loaded for transition validation.`,
        ) as NodeJS.ErrnoException;
        notFoundError.code = "ENOENT";
        throw notFoundError;
      }

      const parsedDependencyIssue = await parseTargetedIssueFile({
        filePath: dependencyLocator.absoluteFilePath,
        startupRelativeFilePath: dependencyLocator.startupRelativeFilePath,
        indexedAt,
        expectedIssueId: link.target.id,
      });

      if (
        !isAcceptedIssueAtResolvedPath(
          currentParsedIssues,
          link.target.id,
          dependencyLocator,
        )
      ) {
        throw createDependencyIssueValidationError(
          "transition.dependency_issue_invalid",
          index,
          link.target.id,
          `Dependency issue ${link.target.id} is not part of the accepted canonical issue set.`,
          {
            filePath: dependencyLocator.startupRelativeFilePath,
          },
        );
      }

      dependencyIssuesById.set(link.target.id, parsedDependencyIssue.issue);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw createDependencyIssueValidationError(
          "transition.dependency_issue_not_found",
          index,
          link.target.id,
          `Dependency issue ${link.target.id} could not be loaded for transition validation.`,
        );
      }

      if (error instanceof UnsafeIssueIdError) {
        throw createDependencyIssueValidationError(
          "transition.dependency_issue_invalid",
          index,
          link.target.id,
          error.message,
        );
      }

      if (error instanceof ScanIssueFileIdMismatchError) {
        throw createDependencyIssueValidationError(
          "transition.dependency_issue_invalid",
          index,
          link.target.id,
          error.message,
          {
            actualIssueId: error.actualIssueId,
            filePath: dependencyLocator?.startupRelativeFilePath,
          },
        );
      }

      if (error instanceof TransitionIssueValidationError) {
        throw error;
      }

      const validationError = toTransitionIssueValidationError(error);

      if (validationError !== undefined) {
        throw createDependencyIssueValidationError(
          "transition.dependency_issue_invalid",
          index,
          link.target.id,
          validationError.errors[0]?.message ?? "Dependency issue is invalid.",
          {
            errors: validationError.errors,
            filePath: dependencyLocator?.startupRelativeFilePath,
          },
        );
      }

      if (error instanceof Error) {
        throw createDependencyIssueValidationError(
          "transition.dependency_issue_invalid",
          index,
          link.target.id,
          error.message,
          {
            filePath: dependencyLocator?.startupRelativeFilePath,
          },
        );
      }

      throw error;
    }
  }

  return Array.from(dependencyIssuesById.values());
}

export async function loadTransitionIssueFilesystemState(
  rootDirectory: string,
  issueId: string,
  indexedAt: string,
  databasePath = join(rootDirectory, ".mis", "index.sqlite"),
): Promise<TransitionIssueFilesystemState> {
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
      throw new TransitionIssueNotFoundError(issueId);
    }
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

    if (
      error instanceof TransitionIssueNotFoundError ||
      (error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw new TransitionIssueNotFoundError(issueId);
    }

    if (error instanceof ScanIssueFileIdMismatchError) {
      throw createTargetIssueInvalidError(
        rootDirectory,
        getTargetIssueFilePath(
          store,
          issueId,
          currentIssueLocator,
        ),
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
        getTargetIssueFilePath(
          store,
          issueId,
          currentIssueLocator,
        ),
        issueId,
        error.message,
        {
          issueId,
        },
      );
    }

    throw error;
  }

  const currentParsedIssues = await loadParsedStartupIssues(rootDirectory, indexedAt);
  if (!isAcceptedIssueAtResolvedPath(currentParsedIssues, issueId, loadedIssue.issueLocator)) {
    throw createTargetIssueInvalidError(
      rootDirectory,
      loadedIssue.issueLocator.absoluteFilePath,
      issueId,
      `Cannot transition issue "${issueId}" because the accepted canonical issue set does not contain the resolved target file.`,
      {
        issueId,
        filePath: loadedIssue.issueLocator.startupRelativeFilePath,
      },
    );
  }

  return {
    currentParsedIssue: loadedIssue.parsedIssue,
    currentParsedIssues,
    currentIssueLocator: loadedIssue.issueLocator,
    canonicalSnapshot: loadedIssue.canonicalSnapshot,
    loadDependencyIssues: (nextStatus) =>
      loadDependencyIssues(
        indexedAt,
        resolver,
        store,
        currentParsedIssues,
        loadedIssue.parsedIssue.issue,
        nextStatus,
      ),
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

export async function persistTransitionedIssueAndBuildEnvelope(
  state: TransitionIssueFilesystemState,
  issue: Issue,
  indexedAt: string,
): Promise<IssueEnvelope> {
  const persistedIssue = await persistTransitionedIssue(
    state.store,
    state.currentIssueLocator,
    issue,
    indexedAt,
  );

  return buildTransitionedIssueEnvelope(persistedIssue, state.currentParsedIssues);
}

export async function rollbackTransitionedIssue(
  state: TransitionIssueFilesystemState,
): Promise<void> {
  await restoreCanonicalIssueSnapshot(state.canonicalSnapshot);
}
