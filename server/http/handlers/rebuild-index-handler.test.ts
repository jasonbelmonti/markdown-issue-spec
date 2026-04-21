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

test("createRebuildIndexHandler normalizes unexpected rebuild failures to the standard api error shape", async () => {
  const handler = createRebuildIndexHandler(async () => {
    throw new Error("kaboom");
  });

  const response = await handler(
    new Request("http://example.com/admin/rebuild-index", {
      method: "POST",
    }),
  );

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: {
      code: "internal_server_error",
      message: "The server failed to process the request.",
    },
  });
});
