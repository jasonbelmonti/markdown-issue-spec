import type { Rfc3339Timestamp } from "../../core/types/index.ts";
import {
  parseTargetedIssueFile,
  type ParsedStartupIssueFile,
} from "../../startup/index.ts";
import type {
  ExistingIssuePathResolver,
  ResolvedIssueLocator,
} from "../../store/index.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import {
  readCanonicalIssueSnapshot,
  type CanonicalIssueSnapshot,
} from "./canonical-issue-snapshot.ts";

export interface LoadedResolvedIssueFile {
  parsedIssue: ParsedStartupIssueFile;
  issueLocator: ResolvedIssueLocator;
  canonicalSnapshot: CanonicalIssueSnapshot;
}

export async function loadResolvedIssueFile(
  store: FilesystemIssueStore,
  resolver: ExistingIssuePathResolver,
  issueId: string,
  indexedAt: Rfc3339Timestamp,
): Promise<LoadedResolvedIssueFile | null> {
  store.getIssueFilePath(issueId);

  const issueLocator = await resolver.resolveExistingIssuePath(issueId);

  if (issueLocator == null) {
    return null;
  }

  return {
    parsedIssue: await parseTargetedIssueFile({
      filePath: issueLocator.absoluteFilePath,
      startupRelativeFilePath: issueLocator.startupRelativeFilePath,
      indexedAt,
      expectedIssueId: issueId,
    }),
    issueLocator,
    canonicalSnapshot: await readCanonicalIssueSnapshot(
      issueLocator.absoluteFilePath,
    ),
  };
}
