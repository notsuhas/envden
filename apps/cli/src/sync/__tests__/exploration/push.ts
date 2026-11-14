import { caughtError, checkCorruptState } from "./checks/errors.ts";
import { checkPush } from "./checks/push.ts";
import { push } from "../../engine.ts";

import type { TFetch } from "../../../client/fetch.ts";

import type { TModel } from "./model.ts";

export function pushActions(model: TModel) {
  const { w, notes, trace, commits, conflictCount, absorb, server, state } = model;

  const doPush = async (d: number, lost: boolean | "unsent") => {
    const reports: string[] = [];
    let swapped = false;

    const fetcher: TFetch = async (input, init) => {
      const swap =
        new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/swap";

      if (swap && lost === "unsent") {
        swapped = true;
        throw new Error("Request never sent");
      }

      const result = await w.f.fetcher(input, init);

      if (
        new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/swap"
      ) {
        swapped = true;
        throw new Error("Lost response");
      }

      return result;
    };

    let result: Awaited<ReturnType<typeof push>> | undefined;

    try {
      result = await push(w.devices[d]!, {
        ...w.f.opts,
        ...(lost ? { fetcher } : {}),
        report: (m: string) => reports.push(m),
      });
    } catch (caught) {
      const error = caughtError(caught);
      const code = error.code;

      if (!(lost && swapped))
        notes.push(`${state.step}:${state.token} push threw ${code}: ${error.message}`);

      trace.push(`${state.token} -> push threw ${code} ${error.message}`);
    }

    checkCorruptState(model, d, reports);

    absorb(reports);
    await model.observe(d);
    const now = await server();
    const head = commits.at(-1);
    const local = await model.activePlaces(d);
    const records = await conflictCount(d);

    trace.push(
      `${state.token} -> push ${JSON.stringify(result && { k: result.kind, c: result.changed, x: result.conflicts })} server=${JSON.stringify(now)} rec=${records} places=${JSON.stringify(local)} reports=${JSON.stringify(reports)}`,
    );

    checkPush(model, { now, head, d, local, records, reports, result });

    return result;
  };

  return { doPush };
}
