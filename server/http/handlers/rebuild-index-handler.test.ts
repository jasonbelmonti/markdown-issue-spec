import { expect, test } from "bun:test";

import { createRebuildIndexHandler } from "./rebuild-index-handler.ts";

test("createRebuildIndexHandler returns rebuild results as deterministic JSON", async () => {
  const handler = createRebuildIndexHandler(async () => ({
    issueEnvelopes: [],
    failures: [],
  }));

  const response = await handler(
    new Request("http://example.com/admin/rebuild-index", {
      method: "POST",
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    issue_count: 0,
    failure_count: 0,
    failures: [],
  });
});
