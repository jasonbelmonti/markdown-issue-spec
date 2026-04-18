import type {
  DependencyIssueLink,
  Issue,
  IssueEnvelope,
  IssueLink,
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
  dependencyIssues: Issue[];
  store: FilesystemIssueStore;
}

interface DependencyLinkEntry {
  index: number;
  link: DependencyIssueLink;
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

function isDependencyLink(link: IssueLink): link is DependencyIssueLink {
  return link.rel === "depends_on";
}

function getDependencyLinkEntries(issue: Issue): DependencyLinkEntry[] {
  return (issue.links ?? [])
    .map((link, index) => ({ index, link }))
    .filter((entry): entry is DependencyLinkEntry => isDependencyLink(entry.link));
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

async function loadDependencyIssues(
  rootDirectory: string,
  indexedAt: string,
  store: FilesystemIssueStore,
  issue: Issue,
): Promise<Issue[]> {
  const dependencyIssuesById = new Map<string, Issue>();

  for (const { index, link } of getDependencyLinkEntries(issue)) {
    if (dependencyIssuesById.has(link.target.id)) {
      continue;
    }

    const dependencyFilePath = store.getIssueFilePath(link.target.id);

    try {
      const parsedDependencyIssue = await scanIssueFile({
        rootDirectory,
        filePath: dependencyFilePath,
        indexedAt,
      });

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

      if (error instanceof ScanIssueFileIdMismatchError) {
        throw createDependencyIssueValidationError(
          "transition.dependency_issue_invalid",
          index,
          link.target.id,
          error.message,
          {
            actualIssueId: error.actualIssueId,
            filePath: toStartupRelativeFilePath(rootDirectory, dependencyFilePath),
          },
        );
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
            filePath: toStartupRelativeFilePath(rootDirectory, dependencyFilePath),
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
            filePath: toStartupRelativeFilePath(rootDirectory, dependencyFilePath),
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
    dependencyIssues: await loadDependencyIssues(
      rootDirectory,
      indexedAt,
      store,
      currentParsedIssue.issue,
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
