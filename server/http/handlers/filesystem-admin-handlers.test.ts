import { expect, test } from "bun:test";

import { createFilesystemAdminRouteHandlers } from "./filesystem-admin-handlers.ts";

test("createFilesystemAdminRouteHandlers serializes rebuild requests even when no mutation lock is provided", async () => {
  let releaseFirstRebuild!: () => void;
  const firstRebuildReleased = new Promise<void>((resolve) => {
    releaseFirstRebuild = resolve;
  });
  let firstRebuildStarted = false;
  let concurrentRebuildCount = 0;
  let activeRebuildCount = 0;
  const handlers = createFilesystemAdminRouteHandlers({
    rootDirectory: "/tmp/unused-root",
    rebuildProjection: async () => {
      activeRebuildCount += 1;
      concurrentRebuildCount = Math.max(concurrentRebuildCount, activeRebuildCount);

      if (!firstRebuildStarted) {
        firstRebuildStarted = true;
        await firstRebuildReleased;
      }

      activeRebuildCount -= 1;

      return {
        issueEnvelopes: [],
        failures: [],
      };
    },
  });

  const firstResponsePromise = handlers.rebuildIndex(
    new Request("http://localhost/admin/rebuild-index", {
      method: "POST",
    }),
  );

  await Bun.sleep(10);

  const secondResponsePromise = handlers.rebuildIndex(
    new Request("http://localhost/admin/rebuild-index", {
      method: "POST",
    }),
  );

  await Bun.sleep(10);
  expect(concurrentRebuildCount).toBe(1);

  releaseFirstRebuild();

  const [firstResponse, secondResponse] = await Promise.all([
    firstResponsePromise,
    secondResponsePromise,
  ]);

  expect(firstResponse.status).toBe(200);
  expect(secondResponse.status).toBe(200);
  expect(concurrentRebuildCount).toBe(1);
});
