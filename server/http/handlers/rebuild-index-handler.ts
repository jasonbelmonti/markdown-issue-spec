import { jsonResponse } from "../response/json.ts";
import type { HttpRouteHandler } from "../route-contract.ts";
import type { FilesystemProjectionRebuilder } from "../../startup/filesystem-projection-rebuilder.ts";

export function createRebuildIndexHandler(
  rebuildProjection: FilesystemProjectionRebuilder,
): HttpRouteHandler {
  return async function handleRebuildIndex(_request: Request): Promise<Response> {
    const result = await rebuildProjection();

    return jsonResponse({
      issue_count: result.issueEnvelopes.length,
      failure_count: result.failures.length,
      failures: result.failures,
    });
  };
}
