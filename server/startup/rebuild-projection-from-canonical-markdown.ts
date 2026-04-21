import {
  scanIssueFilesIntoProjection,
  type ScanIssuesIntoProjectionOptions,
  type StartupScanResult,
} from "./scan-issues.ts";

export type RebuildProjectionFromCanonicalMarkdownOptions =
  ScanIssuesIntoProjectionOptions;

export type RebuildProjectionFromCanonicalMarkdownResult = StartupScanResult;

export async function rebuildProjectionFromCanonicalMarkdown(
  options: RebuildProjectionFromCanonicalMarkdownOptions,
): Promise<RebuildProjectionFromCanonicalMarkdownResult> {
  return scanIssueFilesIntoProjection(options);
}
