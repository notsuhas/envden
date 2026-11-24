import { EnvdenError } from "@envden/core/errors";

type TPolicy = "data" | "recovery" | "join" | "approver";

interface IRoute {
  method: string;
  path: RegExp;
  limit: number;
  policy?: TPolicy;
}

const routes: IRoute[] = [
  { method: "GET", path: /^\/v1\/hello$/, limit: 0 },
  { method: "GET", path: /^\/(v1\/status)?$/, limit: 0 },
  { method: "POST", path: /^\/v1\/vault$/, limit: 65536, policy: "data" },
  { method: "POST", path: /^\/v1\/swap$/, limit: 33554432, policy: "data" },
  { method: "GET", path: /^\/v1\/(head|headers|entries|envelope)$/, limit: 0, policy: "data" },
  { method: "GET", path: /^\/v1\/(devices|blobs)$/, limit: 0 },
  { method: "GET", path: /^\/v1\/(files|keyrings|blobs)\/[^/]+$/, limit: 0, policy: "data" },
  { method: "PUT", path: /^\/v1\/blobs\/[^/]+$/, limit: 16777216, policy: "data" },
  { method: "POST", path: /^\/v1\/recovery\/ticket$/, limit: 65536, policy: "recovery" },
  { method: "POST", path: /^\/v1\/join-requests$/, limit: 65536, policy: "join" },
  { method: "GET", path: /^\/v1\/join-requests$/, limit: 0 },
  { method: "GET", path: /^\/v1\/join-requests\/approved$/, limit: 0, policy: "approver" },
  {
    method: "GET",
    path: /^\/v1\/join-requests\/[1-9][0-9]{0,2}\/(offer|reveal)$/,
    limit: 0,
    policy: "join",
  },
  {
    method: "PUT",
    path: /^\/v1\/join-requests\/[1-9][0-9]{0,2}\/(offer|reveal)$/,
    limit: 65536,
    policy: "join",
  },
  { method: "DELETE", path: /^\/v1\/join-requests\/[1-9][0-9]{0,2}$/, limit: 0, policy: "join" },
  {
    method: "POST",
    path: /^\/v1\/move\/(discard|session|freeze|unfreeze)$/,
    limit: 65536,
    policy: "data",
  },
  { method: "GET", path: /^\/v1\/move\/proof-pub$/, limit: 0, policy: "data" },
  {
    method: "POST",
    path: /^\/v1\/(move|repair)\/(history|chain)$/,
    limit: 33554432,
    policy: "data",
  },
  {
    method: "PUT",
    path: /^\/v1\/(move|repair)\/material\/[^/]+\/[^/]+$/,
    limit: 33554432,
    policy: "data",
  },
  { method: "PUT", path: /^\/v1\/repair\/report$/, limit: 3200182, policy: "data" },
  { method: "GET", path: /^\/v1\/repair\/(status|reports)$/, limit: 0, policy: "data" },
];

// HEAD runs the GET handler and drops the body, so it follows the GET route.
function matchRoute(method: string, path: string) {
  const routed = method === "HEAD" ? "GET" : method;

  return routes.find((route) => route.method === routed && route.path.test(path));
}

export function requestRoute(request: Request): IRoute {
  const route = matchRoute(request.method, new URL(request.url).pathname);
  if (!route) throw new EnvdenError("NOT_FOUND", "Unknown route");

  if (
    route.limit === 0 &&
    (request.body !== null || Number(request.headers.get("Content-Length")) > 0)
  )
    throw new EnvdenError("INVALID_INPUT", "Request body not allowed");

  return route;
}

export function nonMemberPolicy(method: string, path: string): TPolicy | undefined {
  return matchRoute(method, path)?.policy;
}
