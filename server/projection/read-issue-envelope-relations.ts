import type { Database } from "bun:sqlite";

import {
  getRelevantDependencyIdsForNextTransition,
  getUnsatisfiedDependencyIds,
  type DependencyTargetState,
} from "../core/dependency-readiness.ts";
import type { DerivedIssueFields, Issue, IssueLink } from "../core/types/index.ts";
import { PROJECTION_TABLE_NAMES } from "./schema.ts";

interface ProjectedIssueIdRow {
  issue_id: string;
}

interface ProjectedDependencyStateRow {
  issue_id: string;
  status: Issue["status"];
  resolution: Issue["resolution"] | null;
}

function getIncomingRelationIds(
  database: Database,
  targetIssueId: string,
  relation: IssueLink["rel"],
): string[] {
  return database
    .query<ProjectedIssueIdRow, [string, string]>(
      `SELECT DISTINCT issue_id
       FROM ${PROJECTION_TABLE_NAMES.links}
       WHERE rel = ?1 AND target_issue_id = ?2
       ORDER BY issue_id`,
    )
    .all(String(relation), targetIssueId)
    .map((row: ProjectedIssueIdRow) => row.issue_id);
}

function buildParameterPlaceholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `?${index + 1}`).join(", ");
}

function readDependencyStates(
  database: Database,
  dependencyIssueIds: readonly string[],
): ReadonlyMap<string, DependencyTargetState> {
  if (dependencyIssueIds.length === 0) {
    return new Map<string, DependencyTargetState>();
  }

  const rows = database
    .query<ProjectedDependencyStateRow, string[]>(
      `SELECT issue_id, status, resolution
       FROM ${PROJECTION_TABLE_NAMES.issues}
       WHERE issue_id IN (${buildParameterPlaceholders(dependencyIssueIds.length)})`,
    )
    .all(...dependencyIssueIds);

  return new Map(
    rows.map((row: ProjectedDependencyStateRow) => [
      row.issue_id,
      {
        status: row.status,
        resolution: row.resolution,
      },
    ]),
  );
}

function getBlockingDependencyIds(database: Database, issue: Issue): string[] {
  const evaluatedDependencyIds = getRelevantDependencyIdsForNextTransition(issue);

  if (evaluatedDependencyIds.length === 0) {
    return [];
  }

  const dependencyStates = readDependencyStates(database, evaluatedDependencyIds);

  return getUnsatisfiedDependencyIds(
    evaluatedDependencyIds,
    (dependencyIssueId) => dependencyStates.get(dependencyIssueId),
  );
}

export function deriveIssueEnvelopeFields(
  database: Database,
  issue: Issue,
): DerivedIssueFields {
  const blockedByIds = getBlockingDependencyIds(database, issue);

  return {
    children_ids: getIncomingRelationIds(database, issue.id, "parent"),
    blocks_ids: getIncomingRelationIds(database, issue.id, "depends_on"),
    blocked_by_ids: blockedByIds,
    duplicates_ids: getIncomingRelationIds(database, issue.id, "duplicate_of"),
    ready: blockedByIds.length === 0,
    is_blocked: blockedByIds.length > 0,
  };
}
