import { Hono } from "hono";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { listDevices } from "../../admin/devices/list.ts";
import { renameDevice } from "../../admin/devices/rename.ts";
import { fileHistory } from "../../history/list/run.ts";
import { restoreVersion } from "../../history/restore/run.ts";
import { pull, push } from "../../sync/engine.ts";
import { resolveConflict } from "../../sync/resolve.ts";
import { dashboardSyncOptions } from "../actions/options.ts";
import { dashboardRestoreOptions } from "../actions/restore.ts";
import type { IHistoryView, IRestoreView } from "../view/model.ts";
import { dashboardStatus } from "../view/status.ts";
import { fileInputSchema } from "./inputs/file.ts";
import { parseInput } from "./inputs/parse.ts";
import { renameInputSchema } from "./inputs/rename.ts";
import { resolveInputSchema } from "./inputs/resolve.ts";
import { restoreInputSchema } from "./inputs/restore.ts";

export function apiRoutes(adapters: TAdapters, now: () => number) {
  const body = (request: { json: () => Promise<unknown> }) => request.json().catch(() => undefined);

  return new Hono()
    .get("/status", async (c) => c.json(await dashboardStatus(adapters, now)))
    .get("/devices", async (c) => c.json(await listDevices(adapters, now)))
    .post("/pull", async (c) => c.json(await pull(adapters, dashboardSyncOptions(adapters, now))))
    .post("/push", async (c) => c.json(await push(adapters, dashboardSyncOptions(adapters, now))))
    .post("/resolve", async (c) => {
      const input = parseInput(
        resolveInputSchema,
        await body(c.req),
        "Choose a conflict and a side",
      );

      return c.json(await resolveConflict(adapters, { file: input.id, choice: input.choice, now }));
    })
    .post("/devices/rename", async (c) => {
      const input = parseInput(renameInputSchema, await body(c.req), "Enter a device name");

      return c.json(await renameDevice(adapters, input.name, now));
    })
    .get("/history", async (c) => {
      const input = parseInput(fileInputSchema, c.req.query(), "Choose an env file");

      const result = await fileHistory(adapters, {
        cwd: input.root,
        file: input.path,
        now,
        fetcher: adapters.fetcher,
      });

      const file: IHistoryView | undefined = result.files[0];
      if (!file) throw new EnvdenError("NOT_FOUND", "File is not in an approved checkout");

      return c.json(file);
    })
    .post("/history/restore", async (c) => {
      const input = parseInput(restoreInputSchema, await body(c.req), "Choose a version");

      const result = await restoreVersion(adapters, dashboardRestoreOptions(adapters, now, input));

      return c.json(result satisfies IRestoreView);
    });
}
