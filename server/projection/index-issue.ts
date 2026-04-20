import type { Database } from "bun:sqlite";

import type { IssueEnvelope, IssueLink } from "../core/types/index.ts";
import { PROJECTION_TABLE_NAMES } from "./schema.ts";
import { serializeProjectionJson } from "./json.ts";

function booleanToInteger(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function upsertIssueRow(database: Database, envelope: IssueEnvelope): void {
  const { derived, issue, revision, source } = envelope;

  database
    .query(
      `INSERT INTO ${PROJECTION_TABLE_NAMES.issues} (
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
         ready,
         is_blocked,
         extensions_json
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
       )
       ON CONFLICT(issue_id) DO UPDATE SET
         spec_version = excluded.spec_version,
         title = excluded.title,
         kind = excluded.kind,
         status = excluded.status,
         resolution = excluded.resolution,
         summary = excluded.summary,
         body = excluded.body,
         priority = excluded.priority,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         revision = excluded.revision,
         file_path = excluded.file_path,
         indexed_at = excluded.indexed_at,
         has_labels = excluded.has_labels,
         has_assignees = excluded.has_assignees,
         has_links = excluded.has_links,
         ready = excluded.ready,
         is_blocked = excluded.is_blocked,
         extensions_json = excluded.extensions_json`,
    )
    .run(
      issue.id,
      issue.spec_version,
      issue.title,
      issue.kind,
      issue.status,
      issue.resolution ?? null,
      issue.summary ?? null,
      issue.body ?? null,
      issue.priority ?? null,
      issue.created_at,
      issue.updated_at ?? null,
      revision,
      source.file_path,
      source.indexed_at,
      booleanToInteger(issue.labels !== undefined),
      booleanToInteger(issue.assignees !== undefined),
      booleanToInteger(issue.links !== undefined),
      booleanToInteger(derived.ready),
      booleanToInteger(derived.is_blocked),
      serializeProjectionJson(issue.extensions),
    );
}

function replaceIssueLabels(database: Database, envelope: IssueEnvelope): void {
  const labels = envelope.issue.labels ?? [];

  database
    .query(`DELETE FROM ${PROJECTION_TABLE_NAMES.labels} WHERE issue_id = ?1`)
    .run(envelope.issue.id);

  const insertLabel = database.query(
    `INSERT INTO ${PROJECTION_TABLE_NAMES.labels} (
       issue_id,
       position,
       label
     ) VALUES (?1, ?2, ?3)`,
  );

  for (const [position, label] of labels.entries()) {
    insertLabel.run(envelope.issue.id, position, label);
  }
}

function replaceIssueAssignees(database: Database, envelope: IssueEnvelope): void {
  const assignees = envelope.issue.assignees ?? [];

  database
    .query(`DELETE FROM ${PROJECTION_TABLE_NAMES.assignees} WHERE issue_id = ?1`)
    .run(envelope.issue.id);

  const insertAssignee = database.query(
    `INSERT INTO ${PROJECTION_TABLE_NAMES.assignees} (
       issue_id,
       position,
       assignee
     ) VALUES (?1, ?2, ?3)`,
  );

  for (const [position, assignee] of assignees.entries()) {
    insertAssignee.run(envelope.issue.id, position, assignee);
  }
}

function insertIssueLink(
  database: Database,
  issueId: string,
  position: number,
  link: IssueLink,
): void {
  let requiredBefore: string | null = null;

  if (link.rel === "depends_on") {
    requiredBefore = link.required_before ?? null;
  }

  database
    .query(
      `INSERT INTO ${PROJECTION_TABLE_NAMES.links} (
         issue_id,
         position,
         rel,
         target_issue_id,
         target_href,
         target_path,
         target_title,
         note,
         required_before,
         extensions_json
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .run(
      issueId,
      position,
      String(link.rel),
      link.target.id,
      link.target.href ?? null,
      link.target.path ?? null,
      link.target.title ?? null,
      link.note ?? null,
      requiredBefore,
      serializeProjectionJson(link.extensions),
    );
}

function replaceIssueLinks(database: Database, envelope: IssueEnvelope): void {
  const links = envelope.issue.links ?? [];

  database
    .query(`DELETE FROM ${PROJECTION_TABLE_NAMES.links} WHERE issue_id = ?1`)
    .run(envelope.issue.id);

  for (const [position, link] of links.entries()) {
    insertIssueLink(database, envelope.issue.id, position, link);
  }
}

export function indexIssueEnvelope(
  database: Database,
  envelope: IssueEnvelope,
): void {
  upsertIssueRow(database, envelope);
  replaceIssueLabels(database, envelope);
  replaceIssueAssignees(database, envelope);
  replaceIssueLinks(database, envelope);
}
