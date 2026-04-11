import { clearProjectionState } from "../projection/index.ts";
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
  clearProjectionState(options.database);

  return scanIssueFilesIntoProjection(options);
}
