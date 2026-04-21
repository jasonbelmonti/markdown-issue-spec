import { defaultFilesystemIssueMutationLock } from "./default-filesystem-issue-mutation-lock.ts";
import { createFilesystemAdminRouteHandlers } from "./filesystem-admin-handlers.ts";
import type { AdminRouteHandlers } from "./types.ts";

export const defaultAdminHandlers: AdminRouteHandlers =
  createFilesystemAdminRouteHandlers({
    rootDirectory: process.cwd(),
    mutationLock: defaultFilesystemIssueMutationLock,
  });
