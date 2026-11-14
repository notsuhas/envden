import { syncContext } from "../../remote/context.ts";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { syncFixture } from "../flows.ts";
import { resetMatrix } from "../matrix-fixture.ts";
import { approveLayout } from "../round-fixture.ts";

import { loadState, saveState } from "../../../state/store/repository.ts";
import { setConfig } from "../../../settings/config.ts";
import { storePath } from "../../../store/path.ts";
import { writeBytes } from "../../local/files.ts";

import { push } from "../../engine.ts";

export const INIT = "TOKEN=local-test-value\n";

let f: Awaited<ReturnType<typeof syncFixture>> | undefined;

let originals: Pick<Awaited<ReturnType<typeof syncFixture>>["first"], "placement" | "repo">[];

let scenario = 0;

let used = 0;

let pending = Promise.resolve();

export function isolatedTrace<T>(run: () => Promise<T>) {
  const result = pending.then(run);

  pending = result.then(
    () => {},
    () => {},
  );

  return result;
}

export async function fresh(layout: readonly ("copy" | "link")[]) {
  if (f && used++ === 10) {
    await f.cleanup();
    f = undefined;
    used = 0;
  }

  if (!f) {
    f = await syncFixture();

    originals = [f.first, f.second, f.third].map((a) => ({
      placement: a.placement,
      repo: { ...a.repo },
    }));
  }

  for (const [i, adapters] of [f.first, f.second, f.third].entries()) {
    Object.assign(adapters, originals[i], { repo: { ...originals[i]!.repo } });

    for (const name of ["base", "store", "conflicts"])
      await rm(join(adapters.home, name), { recursive: true, force: true });

    for (const name of [
      "attempts",
      "applied-files.json",
      "conflicts.json",
      "placement.json",
      "pending-repairs.json",
      "upload-attempt.json",
    ])
      await rm(join(adapters.home, "state", name), { recursive: true, force: true });

    await setConfig("placement", "{}", adapters.home);
  }

  for (const root of [f.checkout.root, f.checkoutB.root]) {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  }

  await resetMatrix(f, `rev-${process.pid}-${scenario++}`);
  const store = storePath(f.first.home, f.checkout.repoId, ".env");
  const path = join(f.checkout.root, ".env");
  await writeBytes(store, new TextEncoder().encode(INIT));
  await f.first.placement("link", f.checkout.root).place(store, path);
  const state = (await loadState(f.first.home))!;
  state.links = [{ root: f.checkout.root, path: ".env", store, mode: "link" }];
  await saveState(f.first.home, state);
  await push(f.first, f.opts);
  const targets = await approveLayout({ ...f, aStore: store }, layout);

  return {
    observer: await syncContext(f.third, f.opts),
    f: { ...f, aStore: store },
    devices: [f.first, f.second] as const,
    targets: [[{ root: f.checkout.root, path: ".env", store, mode: "link" as const }], targets],
    stores: [store, targets[0]!.store],
  };
}

export async function shutdown() {
  await pending;
  if (f) await f.cleanup();
  f = undefined;
}

export type TWorld = Awaited<ReturnType<typeof fresh>>;
