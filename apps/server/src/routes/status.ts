import type { Context, Hono } from "hono";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { requestRoute } from "./policy.ts";
import { statusHeaders } from "../status/page/headers.ts";
import { admitRequest } from "../status/limit.ts";
import { renderStatusPage } from "../status/page/render.ts";
import { readStatus } from "../status/read.ts";
import type { IStatusState } from "../status/types.ts";

export function registerStatus(app: Hono<TServerEnv>, options: IAppOptions, state: IStatusState) {
  let window = { start: -Infinity, count: 0 };

  function admit(c: Context<TServerEnv>) {
    for (const [name, value] of Object.entries(statusHeaders)) c.header(name, value);
    requestRoute(c.req.raw);
    if (!state.enabled) throw new EnvdenError("NOT_FOUND", "Status page disabled");

    const next = admitRequest(window, options.now());
    if (!next) throw new EnvdenError("RATE_LIMITED", "Too many status requests");
    window = next;

    return readStatus(options, state);
  }

  return app
    .get("/", (c) => c.html(renderStatusPage(admit(c), options.now())))
    .get("/v1/status", (c) => c.json(admit(c)));
}
