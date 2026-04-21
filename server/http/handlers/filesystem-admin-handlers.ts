import { createFilesystemProjectionRebuilder } from "../../startup/filesystem-projection-rebuilder.ts";
import {
  type FilesystemIssueMutationLock,
  withFilesystemIssueMutationLock,
} from "../../application/mutations/filesystem-issue-mutation-lock.ts";
import { createRebuildIndexHandler } from "./rebuild-index-handler.ts";
import type { AdminRouteHandlers } from "./types.ts";

export interface FilesystemAdminRouteHandlersOptions {
  rootDirectory: string;
  databasePath?: string;
  mutationLock?: FilesystemIssueMutationLock;
}

export function createFilesystemAdminRouteHandlers(
  options: FilesystemAdminRouteHandlersOptions,
): AdminRouteHandlers {
  const rebuildProjection = createFilesystemProjectionRebuilder({
    rootDirectory: options.rootDirectory,
    databasePath: options.databasePath,
  });
  const serializedRebuildProjection =
    options.mutationLock === undefined
      ? rebuildProjection
      : () =>
          withFilesystemIssueMutationLock(
            options.mutationLock,
            rebuildProjection,
          );

  return {
    rebuildIndex: createRebuildIndexHandler(serializedRebuildProjection),
  };
}
