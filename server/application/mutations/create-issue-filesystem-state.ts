import type {
  Issue,
  IssueEnvelope,
  ValidationError,
} from "../../core/types/index.ts";
import { validateIssueGraph } from "../../core/validation/index.ts";
import { type ParsedStartupIssueFile, buildStartupIssueEnvelope } from "../../startup/index.ts";
import { listCanonicalIssueFiles } from "../../startup/issue-file-discovery.ts";
import { scanIssueFile, toStartupRelativeFilePath } from "../../startup/scan-issue-file.ts";
import { FilesystemIssueStore } from "../../store/index.ts";

export interface CreateIssueFilesystemState {
  currentParsedIssues: ParsedStartupIssueFile[];
  candidateFilePath: string;
  store: FilesystemIssueStore;
}

export async function loadCreateIssueFilesystemState(
  rootDirectory: string,
  issueId: string,
  indexedAt: string,
): Promise<CreateIssueFilesystemState> {
  const currentParsedIssues = await loadParsedStartupIssues(rootDirectory, indexedAt);
  const store = new FilesystemIssueStore({ rootDirectory });

  return {
    currentParsedIssues,
    candidateFilePath: toStartupRelativeFilePath(
      rootDirectory,
      store.getIssueFilePath(issueId),
    ),
    store,
  };
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
