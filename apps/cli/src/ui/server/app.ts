import { Hono } from "hono";
import type { TAdapters } from "../../adapters.ts";
import { apiRoutes } from "../routes/api.ts";
import { pageRoutes } from "../routes/page.ts";
import type { IPageAsset } from "./assets.ts";
import { errorBody, errorStatus } from "./errors.ts";
import { securityHeaders } from "./headers.ts";
import { allowedHost, sameOrigin } from "./host.ts";
import { tokenMatches } from "./token.ts";

interface IDashboard {
  adapters: TAdapters;
  now: () => number;
  token: string;
  port: number;
  assets: Map<string, IPageAsset>;
}

export function createDashboardApp(dashboard: IDashboard) {
  const { adapters, now, token, port, assets } = dashboard;

  return new Hono()
    .onError((error, c) => {
      const body = errorBody(error);

      return c.json(body, errorStatus(body.error));
    })
    .use("*", async (c, next) => {
      await next();

      for (const [name, value] of Object.entries(securityHeaders)) c.res.headers.set(name, value);
    })
    .use("*", async (c, next) => {
      if (!allowedHost(c.req.header("Host"), port))
        return c.json({ error: "INVALID_INPUT", message: "Unexpected host" }, 421);

      await next();
    })
    .use("/api/*", async (c, next) => {
      if (!tokenMatches(c.req.header("Authorization"), token))
        return c.json({ error: "UNAUTHORIZED", message: "Open the link envden ui printed" }, 401);

      if (c.req.method !== "GET" && !sameOrigin(c.req.header("Origin"), c.req.header("Host")))
        return c.json({ error: "UNAUTHORIZED", message: "Cross-origin request refused" }, 403);

      await next();
    })
    .route("/api", apiRoutes(adapters, now))
    .route("/", pageRoutes(assets));
}

export type TDashboardApp = ReturnType<typeof createDashboardApp>;
