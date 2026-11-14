import { read } from "./files.ts";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { atomicWrite } from "../../../state/store/files.ts";

import { INIT } from "./fixture.ts";
import type { TModel } from "./model.ts";
import { pullActions } from "./pull.ts";
import { pushActions } from "./push.ts";
import { localActions } from "./local.ts";

export function actions(model: TModel) {
  const { w, trace, write, state } = model;

  const { doPull } = pullActions(model);
  const { doPush } = pushActions(model);
  const { doRemove, doResolve, doRetrack } = localActions(model);
  const restores = new Map<number, () => void>();

  const apply = async (raw: string): Promise<boolean> => {
    state.token = raw;
    const d = raw[0] === "A" ? 0 : 1;
    const [head, value] = raw.split("=");
    const kind = head![1]!;
    const t = head!.length > 2 ? Number(head![2]) : kind === "f" ? w.targets[d]!.length - 1 : 0;

    if (kind === "e" || kind === "r") return edit(kind, d, t, value);

    if (await syncAction(kind, d, t)) return true;

    await special(kind, d, t, value);

    return true;
  };

  async function syncAction(kind: string, d: number, t: number) {
    switch (kind) {
      case "l":
        await doPull(d, undefined);

        return true;
      case "f":
        await doPull(d, t);

        return true;
      case "s":
        await doPush(d, false);

        return true;
      case "x":
        await doPush(d, true);

        return true;
      case "m":
        await doRemove(d);

        return true;
      case "k":
        await doResolve(d, "keep-mine");

        return true;
      case "t":
        await doResolve(d, "take-server");

        return true;
      case "u":
        await doRetrack(d);

        return true;
    }

    return false;
  }

  async function edit(kind: string, d: number, t: number, value: string | undefined) {
    const bytes = kind === "r" ? INIT : `TOKEN=${value ?? `u${state.unique++}`}\n`;
    const wrote = await write(d, t, bytes);
    trace.push(`${state.token} -> wrote ${JSON.stringify(bytes)} ${wrote}`);

    return wrote;
  }

  async function special(kind: string, d: number, t: number, value: string | undefined) {
    if (kind === "d") {
      const target = w.targets[d]![t]!;
      const path = join(target.root, target.path);
      const bytes = value ? `TOKEN=${value}\n` : INIT;
      const before = await read(path);
      await rm(path, { force: true });
      await atomicWrite(path, bytes);
      if (bytes !== before) model.recordEdit(d, bytes, before);
      await model.settleUnobserved(d, t);
      trace.push(`${state.token} -> detached write ${JSON.stringify(bytes)}`);
    } else if (kind === "z") {
      const adapters = w.devices[d]!;
      const root = w.targets[d]![t]!.root;
      if (restores.has(d)) return;
      model.skipped.add(root);
      const original = adapters.repo.checkoutAt.bind(adapters.repo);
      restores.set(d, () => (adapters.repo.checkoutAt = original));
      adapters.repo.checkoutAt = async (at: string) => (at === root ? undefined : original(at));
      trace.push(`${state.token} -> skipping ${root}`);
    } else if (kind === "y") {
      restores.get(d)?.();
      restores.delete(d);
      for (const target of w.targets[d]!) model.skipped.delete(target.root);
      trace.push(`${state.token} -> restored`);
    } else throw new Error(`Unknown token ${kind}`);
  }

  function restoreCheckouts() {
    for (const restore of restores.values()) restore();
    restores.clear();
    model.skipped.clear();
  }

  return { apply, doPull, doPush, doResolve, restoreCheckouts };
}
