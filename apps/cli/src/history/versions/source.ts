import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { adminContext } from "../../admin/shared/context.ts";
import { currentHistory } from "../../admin/shared/history.ts";
import { currentMaterial } from "../../admin/shared/material.ts";

export async function historySource(adapters: TAdapters, now: () => number, fetcher: TFetch) {
  const context = await adminContext(adapters, now, fetcher);
  const history = await currentHistory(context);
  const { ring, keys } = await currentMaterial(context, history);

  return { context, history, keys, idKey: ring.idKey };
}

export type THistorySource = Awaited<ReturnType<typeof historySource>>;
