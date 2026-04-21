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
const ENTRYPOINT_PATH = fileURLToPath(new URL("../../index.ts", import.meta.url));
const SERVER_LISTENING_LOG_PATTERN =
  /markdown-issue-spec server listening on (http:\/\/[^\s]+)/;

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

function getExitPromise(server: SpawnedServer): Promise<void> {
  if (server.process.exitCode !== null) {
    return Promise.resolve();
  }

  return once(server.process, "exit").then(() => undefined);
}

function formatServerOutput(server: SpawnedServer): string {
  return [
    `stdout:\n${server.stdout.join("")}`,
    `stderr:\n${server.stderr.join("")}`,
  ].join("\n\n");
}

function getListeningServerUrl(server: SpawnedServer): string | null {
  const match = SERVER_LISTENING_LOG_PATTERN.exec(server.stdout.join(""));

  return match?.[1] ?? null;
}

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-local-startup-"));
}

function spawnDefaultEntrypoint(rootDirectory: string): SpawnedServer {
  const serverProcess = spawn("bun", ["run", ENTRYPOINT_PATH], {
    cwd: rootDirectory,
    env: {
      ...process.env,
      MIS_HOSTNAME: "127.0.0.1",
      MIS_PORT: "0",
    },
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

async function waitForServerReady(server: SpawnedServer): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVER_BOOT_TIMEOUT_MS) {
    if (server.process.exitCode !== null) {
      throw new Error(
        [
          "The shipped entrypoint exited before the smoke test could connect.",
          formatServerOutput(server),
        ].join("\n\n"),
      );
    }

    const serverUrl = getListeningServerUrl(server);

    if (serverUrl !== null) {
      return serverUrl;
    }

    await sleep(100);
  }

  throw new Error(
    [
      `Timed out waiting ${SERVER_BOOT_TIMEOUT_MS}ms for the default entrypoint.`,
      formatServerOutput(server),
    ].join("\n\n"),
  );
}

async function stopServer(server: SpawnedServer): Promise<void> {
  if (server.process.exitCode !== null || server.process.killed) {
    return;
  }

  const exitPromise = getExitPromise(server);

  server.process.kill("SIGTERM");

  try {
    await Promise.race([
      exitPromise,
      sleep(SERVER_SHUTDOWN_TIMEOUT_MS).then(() => {
        throw new Error("Timed out waiting for the startup smoke test server to exit.");
      }),
    ]);
  } catch {
    server.process.kill("SIGKILL");
    await exitPromise;
  }
}

test("bun run index.ts boots the shipped service against cwd-backed storage and serves the documented rebuild flow", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(SEEDED_ISSUE);

  const server = spawnDefaultEntrypoint(rootDirectory);

  try {
    const serverUrl = await waitForServerReady(server);

    const beforeRebuildResponse = await fetch(
      `${serverUrl}/issues/${SEEDED_ISSUE.id}`,
    );

    expect(beforeRebuildResponse.status).toBe(404);

    const rebuildResponse = await fetch(`${serverUrl}/admin/rebuild-index`, {
      method: "POST",
    });

    expect(rebuildResponse.status).toBe(200);
    expect(await rebuildResponse.json()).toEqual({
      issue_count: 1,
      failure_count: 0,
      failures: [],
    });

    await expect(stat(join(rootDirectory, ".mis", "index.sqlite"))).resolves.toBeDefined();

    const issueResponse = await fetch(`${serverUrl}/issues/${SEEDED_ISSUE.id}`);

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
