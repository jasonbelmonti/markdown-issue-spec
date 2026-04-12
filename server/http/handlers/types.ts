export type HttpRouteMethod = "PATCH" | "POST";

export type HttpRouteHandler = (request: Request) => Response | Promise<Response>;

export interface MutationRouteHandlers {
  createIssue: HttpRouteHandler;
  patchIssue: HttpRouteHandler;
  transitionIssue: HttpRouteHandler;
}

export interface HttpRouteDefinition {
  pathname: string;
  method: HttpRouteMethod;
  handler: HttpRouteHandler;
}
