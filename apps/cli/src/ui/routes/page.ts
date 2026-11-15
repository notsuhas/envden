import { Hono } from "hono";
import type { IPageAsset } from "../server/assets.ts";

export function pageRoutes(assets: Map<string, IPageAsset>) {
  return new Hono().get("*", (c) => {
    const asset = assets.get(c.req.path);
    if (!asset) return c.notFound();

    return c.body(asset.body, 200, { "Content-Type": asset.type });
  });
}
