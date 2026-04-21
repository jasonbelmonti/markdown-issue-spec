import { defaultFilesystemIssueMutationLock } from "./default-filesystem-issue-mutation-lock.ts";
import { createFilesystemMutationRouteHandlers } from "./filesystem-mutation-handlers.ts";
import type { MutationRouteHandlers } from "./types.ts";

export const defaultMutationHandlers: MutationRouteHandlers =
  createFilesystemMutationRouteHandlers({
    rootDirectory: process.cwd(),
    mutationLock: defaultFilesystemIssueMutationLock,
  });
