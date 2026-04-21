import type { HttpRouteHandler } from "../route-contract.ts";

export interface MutationRouteHandlers {
  createIssue: HttpRouteHandler;
  patchIssue: HttpRouteHandler;
  transitionIssue: HttpRouteHandler;
}

export interface AdminRouteHandlers {
  rebuildIndex: HttpRouteHandler;
}

export interface QueryRouteHandlers {
  getIssue: HttpRouteHandler;
  listIssues: HttpRouteHandler;
  listValidationErrors: HttpRouteHandler;
}
