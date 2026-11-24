import { storeMaterial } from "../../repair/material/store.ts";
import type { Hono, Context } from "hono";
import type { IAppOptions, TServerEnv } from "../../http/types.ts";
import { requireMove } from "../../move/session.ts";
import { requireRepair } from "../../vault/authorization.ts";
import { binary } from "../../http/encoding.ts";

export function registerImport(app: Hono<TServerEnv>, options: IAppOptions) {
  return app
    .put("/v1/move/material/:kind/:hash", materialHandler(options, requireMove))
    .put("/v1/repair/material/:kind/:hash", materialHandler(options, requireRepair));
}

function materialHandler(options: IAppOptions, authorize: typeof requireMove) {
  return async (c: Context<TServerEnv, "/:kind/:hash">) => {
    const auth = c.get("auth");
    authorize(options, auth);

    return c.json(
      storeMaterial(
        options,
        auth,
        c.req.param("kind"),
        binary(c.req.param("hash"), 32),
        new Uint8Array(await c.req.arrayBuffer()),
      ),
    );
  };
}
