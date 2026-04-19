import { expect, test } from "bun:test";

import {
  deserializeProjectionJson,
  deserializeProjectionJsonOrDefault,
  serializeProjectionJson,
} from "./json.ts";

test("deserializeProjectionJson parses stored projection json and preserves nullish values", () => {
  expect(
    deserializeProjectionJson<{ related_issue_ids: string[] }>(
      '{"related_issue_ids":["ISSUE-1","ISSUE-2"]}',
    ),
  ).toEqual({
    related_issue_ids: ["ISSUE-1", "ISSUE-2"],
  });

  expect(deserializeProjectionJson<string[]>(null)).toBeNull();
  expect(deserializeProjectionJson<string[]>(undefined)).toBeNull();
});

test("deserializeProjectionJsonOrDefault falls back only for missing projection columns", () => {
  expect(
    deserializeProjectionJsonOrDefault<string[]>(
      serializeProjectionJson(["ISSUE-1"]),
      [],
    ),
  ).toEqual(["ISSUE-1"]);
  expect(deserializeProjectionJsonOrDefault<string[]>(null, [])).toEqual([]);
  expect(deserializeProjectionJsonOrDefault<string[]>(undefined, [])).toEqual([]);
  expect(
    deserializeProjectionJsonOrDefault<string[]>(
      serializeProjectionJson(null),
      [],
    ),
  ).toBeNull();
});
