import { expect, test } from "bun:test";
import { once } from "node:events";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import type { Issue } from "../core/types/index.ts";
import { FilesystemIssueStore } from "../store/index.ts";

const SERVER_BOOT_TIMEOUT_MS = 10_000;
const SERVER_SHUTDOWN_TIMEOUT_MS = 5_000;
const SERVER_URL = "http://127.0.0.1:3000";
const ENTRYPOINT_PATH = fileURLToPath(new URL("../../index.ts", import.meta.url));

const SEEDED_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: "ISSUE-LOCAL-STARTUP",
  title: "Seed canonical Markdown before boot",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-21T12:00:00-05:00",
  updated_at: "2026-04-21T12:05:00-05:00",
  body: "## Objective\n\nProve the documented startup and rebuild path.\n",
};

interface SpawnedServer {
  process: ChildProcessWithoutNullStreams;
  stdout: string[];
  stderr: string[];
}

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-local-startup-"));
}

function spawnDefaultEntrypoint(rootDirectory: string): SpawnedServer {
  const serverProcess = spawn("bun", ["run", ENTRYPOINT_PATH], {
    cwd: rootDirectory,
    stdio: "pipe",
  });
  const stdout: string[] = [];
  const stderr: string[] = [];

  serverProcess.stdout.setEncoding("utf8");
  serverProcess.stderr.setEncoding("utf8");
  serverProcess.stdout.on("data", (chunk: string) => stdout.push(chunk));
  serverProcess.stderr.on("data", (chunk: string) => stderr.push(chunk));

  return {
    process: serverProcess,
    stdout,
    stderr,
  };
}

async function waitForServerReady(server: SpawnedServer): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVER_BOOT_TIMEOUT_MS) {
    if (server.process.exitCode !== null) {
      throw new Error(
        [
          "The shipped entrypoint exited before the smoke test could connect.",
          `stdout:\n${server.stdout.join("")}`,
          `stderr:\n${server.stderr.join("")}`,
        ].join("\n\n"),
      );
    }

    try {
      const response = await fetch(`${SERVER_URL}/issues/${SEEDED_ISSUE.id}`);

      if (response.status === 404) {
        return;
      }
    } catch {
      // The default entrypoint is still starting up.
    }

    await sleep(100);
  }

  throw new Error(
    [
      `Timed out waiting ${SERVER_BOOT_TIMEOUT_MS}ms for the default entrypoint.`,
      `stdout:\n${server.stdout.join("")}`,
      `stderr:\n${server.stderr.join("")}`,
    ].join("\n\n"),
  );
}

async function stopServer(server: SpawnedServer): Promise<void> {
  if (server.process.exitCode !== null || server.process.killed) {
    return;
  }

  server.process.kill("SIGTERM");

  try {
    await Promise.race([
      once(server.process, "exit"),
      sleep(SERVER_SHUTDOWN_TIMEOUT_MS).then(() => {
        throw new Error("Timed out waiting for the startup smoke test server to exit.");
      }),
    ]);
  } catch {
    server.process.kill("SIGKILL");
    await once(server.process, "exit");
  }
}

test("bun run index.ts boots the shipped service against cwd-backed storage and serves the documented rebuild flow", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(SEEDED_ISSUE);

  const server = spawnDefaultEntrypoint(rootDirectory);

  try {
    await waitForServerReady(server);

    const beforeRebuildResponse = await fetch(`${SERVER_URL}/issues/${SEEDED_ISSUE.id}`);

    expect(beforeRebuildResponse.status).toBe(404);

    const rebuildResponse = await fetch(`${SERVER_URL}/admin/rebuild-index`, {
      method: "POST",
    });

    expect(rebuildResponse.status).toBe(200);
    expect(await rebuildResponse.json()).toEqual({
      issue_count: 1,
      failure_count: 0,
      failures: [],
    });

    await expect(stat(join(rootDirectory, ".mis", "index.sqlite"))).resolves.toBeDefined();

    const issueResponse = await fetch(`${SERVER_URL}/issues/${SEEDED_ISSUE.id}`);

    expect(issueResponse.status).toBe(200);
    expect(await issueResponse.json()).toMatchObject({
      issue: SEEDED_ISSUE,
      source: {
        file_path: `vault/issues/${SEEDED_ISSUE.id}.md`,
        indexed_at: expect.any(String),
      },
      revision: expect.any(String),
    });
  } finally {
    await stopServer(server);
  }
});
