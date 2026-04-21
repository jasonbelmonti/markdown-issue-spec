import { createFilesystemProjectionRebuilder } from "../../startup/filesystem-projection-rebuilder.ts";
import {
  createFilesystemIssueMutationLock,
  type FilesystemIssueMutationLock,
  withFilesystemIssueMutationLock,
} from "../../application/mutations/filesystem-issue-mutation-lock.ts";
import { createRebuildIndexHandler } from "./rebuild-index-handler.ts";
import type { AdminRouteHandlers } from "./types.ts";
import type { FilesystemProjectionRebuilder } from "../../startup/filesystem-projection-rebuilder.ts";

export interface FilesystemAdminRouteHandlersOptions {
  rootDirectory: string;
  databasePath?: string;
  mutationLock?: FilesystemIssueMutationLock;
  rebuildProjection?: FilesystemProjectionRebuilder;
}

export function createFilesystemAdminRouteHandlers(
  options: FilesystemAdminRouteHandlersOptions,
): AdminRouteHandlers {
  const rebuildProjection =
    options.rebuildProjection ??
    createFilesystemProjectionRebuilder({
      rootDirectory: options.rootDirectory,
      databasePath: options.databasePath,
    });
  const mutationLock =
    options.mutationLock ?? createFilesystemIssueMutationLock();
  const serializedRebuildProjection = () =>
    withFilesystemIssueMutationLock(
      mutationLock,
      rebuildProjection,
    );

  return {
    rebuildIndex: createRebuildIndexHandler(serializedRebuildProjection),
  };
}
