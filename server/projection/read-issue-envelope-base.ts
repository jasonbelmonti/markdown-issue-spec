import type { Database } from "bun:sqlite";

import {
  type CustomIssueRelation,
  isCoreIssueRelation,
  type ExtensionMap,
  type Issue,
  type IssueEnvelope,
  type IssueLink,
  type IssueRevision,
} from "../core/types/index.ts";
import { deserializeProjectionJson } from "./json.ts";
import { PROJECTION_TABLE_NAMES } from "./schema.ts";

interface ProjectedIssueRow {
  issue_id: string;
  spec_version: Issue["spec_version"];
  title: string;
  kind: string;
  status: Issue["status"];
  resolution: Issue["resolution"] | null;
  summary: string | null;
  body: string | null;
  priority: string | null;
  created_at: string;
  updated_at: string | null;
  revision: IssueRevision;
  file_path: string;
  indexed_at: string;
  has_labels: 0 | 1;
  has_assignees: 0 | 1;
  has_links: 0 | 1;
  extensions_json: string | null;
}

interface ProjectedLinkRow {
  rel: string;
  target_issue_id: string;
  target_href: string | null;
  target_path: string | null;
  target_title: string | null;
  note: string | null;
  required_before: "in_progress" | "completed" | null;
  extensions_json: string | null;
}

export type ProjectionIssueEnvelopeBase = Pick<
  IssueEnvelope,
  "issue" | "revision" | "source"
>;

type IssueRef = IssueLink["target"];

function readProjectedIssueRow(
  database: Database,
  issueId: string,
): ProjectedIssueRow | null {
  return database
    .query<ProjectedIssueRow, [string]>(
      `SELECT
         issue_id,
         spec_version,
         title,
         kind,
         status,
         resolution,
         summary,
         body,
         priority,
         created_at,
         updated_at,
         revision,
         file_path,
         indexed_at,
         has_labels,
         has_assignees,
         has_links,
         extensions_json
       FROM ${PROJECTION_TABLE_NAMES.issues}
       WHERE issue_id = ?1`,
    )
    .get(issueId);
}

function readProjectedStrings(
  database: Database,
  tableName: string,
  columnName: string,
  issueId: string,
): string[] {
  const query = database.query<Record<string, string>, [string]>(
    `SELECT ${columnName}
     FROM ${tableName}
     WHERE issue_id = ?1
     ORDER BY position`,
  );

  return query.all(issueId).map((row: Record<string, string>) => {
    const value = row[columnName];

    if (value === undefined) {
      throw new Error(
        `Projected row for issue "${issueId}" is missing column "${columnName}".`,
      );
    }

    return value;
  });
}

function readProjectedLinks(database: Database, issueId: string): IssueLink[] {
  const rows = database
    .query<ProjectedLinkRow, [string]>(
      `SELECT
         rel,
         target_issue_id,
         target_href,
         target_path,
         target_title,
         note,
         required_before,
         extensions_json
       FROM ${PROJECTION_TABLE_NAMES.links}
       WHERE issue_id = ?1
       ORDER BY position`,
    )
    .all(issueId);

  return rows.map((row: ProjectedLinkRow) => {
    const target: IssueRef = {
      id: row.target_issue_id,
      ...(row.target_href == null ? {} : { href: row.target_href }),
      ...(row.target_path == null ? {} : { path: row.target_path }),
      ...(row.target_title == null ? {} : { title: row.target_title }),
    };
    const extensions = deserializeProjectionJson<ExtensionMap>(row.extensions_json);
    const linkBase = {
      target,
      ...(row.note == null ? {} : { note: row.note }),
      ...(extensions == null ? {} : { extensions }),
    };

    if (row.rel === "depends_on") {
      if (row.required_before == null) {
        throw new Error(
          `Projected dependency link for issue "${issueId}" is missing required_before.`,
        );
      }

      return {
        ...linkBase,
        rel: "depends_on" as const,
        required_before: row.required_before,
      };
    }

    if (isCoreIssueRelation(row.rel)) {
      return {
        ...linkBase,
        rel: row.rel,
      };
    }

    return {
      ...linkBase,
      rel: row.rel as CustomIssueRelation,
    };
  });
}

function hydrateOptionalList<T>(
  values: T[],
  hasField: 0 | 1,
): T[] | undefined {
  if (values.length > 0) {
    return values;
  }

  return hasField === 1 ? [] : undefined;
}

function hydrateProjectedIssue(
  row: ProjectedIssueRow,
  labels: string[],
  assignees: string[],
  links: IssueLink[],
): Issue {
  const hydratedLabels = hydrateOptionalList(labels, row.has_labels);
  const hydratedAssignees = hydrateOptionalList(assignees, row.has_assignees);
  const hydratedLinks = hydrateOptionalList(links, row.has_links);
  const extensions = deserializeProjectionJson<ExtensionMap>(row.extensions_json);
  const issueBase = {
    spec_version: row.spec_version,
    id: row.issue_id,
    title: row.title,
    kind: row.kind,
    created_at: row.created_at,
    ...(row.updated_at == null ? {} : { updated_at: row.updated_at }),
    ...(row.summary == null ? {} : { summary: row.summary }),
    ...(row.body == null ? {} : { body: row.body }),
    ...(row.priority == null ? {} : { priority: row.priority }),
    ...(hydratedLabels === undefined ? {} : { labels: hydratedLabels }),
    ...(hydratedAssignees === undefined ? {} : { assignees: hydratedAssignees }),
    ...(hydratedLinks === undefined ? {} : { links: hydratedLinks }),
    ...(extensions == null ? {} : { extensions }),
  };

  if (row.status === "completed") {
    if (row.resolution !== "done") {
      throw new Error(
        `Projected completed issue "${row.issue_id}" must have resolution "done".`,
      );
    }

    return {
      ...issueBase,
      status: "completed",
      resolution: "done",
    };
  }

  if (row.status === "canceled") {
    if (row.resolution == null || row.resolution === "done") {
      throw new Error(
        `Projected canceled issue "${row.issue_id}" has an invalid resolution.`,
      );
    }

    return {
      ...issueBase,
      status: "canceled",
      resolution: row.resolution,
    };
  }

  return {
    ...issueBase,
    status: row.status,
  };
}

export function readIssueEnvelopeBase(
  database: Database,
  issueId: string,
): ProjectionIssueEnvelopeBase | null {
  const row = readProjectedIssueRow(database, issueId);

  if (row == null) {
    return null;
  }

  const labels = readProjectedStrings(
    database,
    PROJECTION_TABLE_NAMES.labels,
    "label",
    issueId,
  );
  const assignees = readProjectedStrings(
    database,
    PROJECTION_TABLE_NAMES.assignees,
    "assignee",
    issueId,
  );
  const links = readProjectedLinks(database, issueId);

  return {
    issue: hydrateProjectedIssue(row, labels, assignees, links),
    revision: row.revision,
    source: {
      file_path: row.file_path,
      indexed_at: row.indexed_at,
    },
  };
}
