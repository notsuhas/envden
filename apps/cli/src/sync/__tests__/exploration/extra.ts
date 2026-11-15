import { rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "../../../state/store/files.ts";
import { untrack } from "../../../links/checkout/untrack.ts";
import { read } from "./files.ts";
import type { TModel } from "./model.ts";

const fixtureClock = () => 1800000000000;

export async function extraAction(model: TModel, raw: string) {
  const d = raw[0] === "A" ? 0 : 1;
  const operation = raw.slice(1).replace(/\d$/, "");
  const index = Number(/\d$/.exec(raw)?.[0] ?? 0);
  const target = model.w.targets[d]![index]!;
  const home = model.w.devices[d]!.home;

  switch (operation) {
    case "del": {
      const path = join(target.root, target.path);
      const before = await read(path);
      await rm(path, { force: true });

      if (before !== undefined && !(await model.places(d)).includes(before))
        model.required.delete(before);

      await discardInactiveIntent(model, d);
      break;
    }
    case "store": {
      const before = await read(target.store);
      await rm(target.store, { force: true });

      if (before !== undefined && !(await model.places(d)).includes(before))
        model.required.delete(before);

      await discardInactiveIntent(model, d);
      break;
    }
    case "tmp":
      await atomicWrite(
        join(home, "state", "attempts", ".interrupted.tmp"),
        '{"header":',
        fixtureClock,
      );

      await atomicWrite(join(home, "state", "attempts", "stray"), "stray", fixtureClock);
      break;
    case "corrupt":
      await atomicWrite(join(home, "state", "attempts", "A".repeat(43)), "broken", fixtureClock);

      model.dirty[d] = true;
      model.corrupt.add(d);
      break;
    case "v": {
      if (model.untracked.has(target.root) || model.skipped.has(target.root)) return true;
      const cancelled = await untrack(model.w.devices[d]!, target.root);
      model.untracked.add(target.root);

      await discardInactiveIntent(model, d);

      if (cancelled.length && model.last[d] === "\0DEL") model.clean(d, model.agreed[d]);

      break;
    }
    default:
      return false;
  }

  model.trace.push(`${raw} -> ${operation}`);

  return true;
}

async function discardInactiveIntent(model: TModel, d: number) {
  if (model.last[d] === "\0DEL" || model.corrupt.has(d)) return;
  const active = await model.activePlaces(d);
  const pending = [...model.pending[d]!].filter((value) => active.includes(value));

  if (!pending.length) model.clean(d, model.agreed[d]);
  else model.last[d] = pending.at(-1);
}
