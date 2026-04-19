export type HttpRouteMethod = "GET" | "PATCH" | "POST";

export interface HttpRouteRequest extends Request {
  params?: Record<string, string>;
}

export type HttpRouteHandler = (
  request: HttpRouteRequest,
) => Response | Promise<Response>;

export interface HttpRouteDefinition {
  pathname: string;
  method: HttpRouteMethod;
  handler: HttpRouteHandler;
}
