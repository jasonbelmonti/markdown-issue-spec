import { expect, test } from "bun:test";

import { startServer } from "./server.ts";

async function withServer<T>(
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = startServer({ port: 0 });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

test("startServer recognizes the planned mutation endpoints with placeholder handlers", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/issues`, { method: "POST" });
    const patchResponse = await fetch(`${baseUrl}/issues/ISSUE-1234`, {
      method: "PATCH",
    });
    const transitionResponse = await fetch(
      `${baseUrl}/issues/ISSUE-1234/transition`,
      { method: "POST" },
    );

    expect(createResponse.status).toBe(501);
    expect(await createResponse.json()).toEqual({
      error: {
        code: "issue_create_not_implemented",
        message: "POST /issues is not implemented yet.",
        details: {
          endpoint: "POST /issues",
        },
      },
    });

    expect(patchResponse.status).toBe(501);
    expect(await patchResponse.json()).toEqual({
      error: {
        code: "issue_patch_not_implemented",
        message: "PATCH /issues/:id is not implemented yet.",
        details: {
          endpoint: "PATCH /issues/:id",
        },
      },
    });

    expect(transitionResponse.status).toBe(501);
    expect(await transitionResponse.json()).toEqual({
      error: {
        code: "issue_transition_not_implemented",
        message: "POST /issues/:id/transition is not implemented yet.",
        details: {
          endpoint: "POST /issues/:id/transition",
        },
      },
    });
  });
});

test("startServer keeps the structured json 404 fallback for unmatched routes", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "route_not_found",
        message: "No route matches the requested path.",
      },
    });
  });
});
