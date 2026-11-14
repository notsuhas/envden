import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import type { syncFixture } from "./flows.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { setConfig } from "../../settings/config.ts";
import { pull } from "../engine.ts";

export async function approveLayout(
  f: Awaited<ReturnType<typeof syncFixture>>,
  modes: readonly ("link" | "copy")[],
) {
  const targets = modes.map((mode, i) => ({
    ...f.checkoutB,
    root: join(f.root, `round-target-${i}`),
    mode,
  }));

  for (const target of targets) {
    await rm(target.root, { recursive: true, force: true });
    await mkdir(target.root, { recursive: true });
  }

  const state = (await loadState(f.second.home))!;
  state.approved = targets;

  f.second.repo = createFakeRepoAdapter({
    checkoutAt: async (root) => targets.find((target) => target.root === root),
    ensureIgnored: async () => {},
    caseInsensitive: async () => false,
  });

  await saveState(f.second.home, state);

  await setConfig(
    "placement",
    JSON.stringify(Object.fromEntries(targets.map((target) => [target.root, target.mode]))),
    f.second.home,
  );

  await pull(f.second, f.opts);

  return (await loadState(f.second.home))!.links;
}

export async function approveThird(f: Awaited<ReturnType<typeof syncFixture>>) {
  const checkout = { ...f.checkoutB, root: join(f.root, "round-observer") };
  await rm(checkout.root, { recursive: true, force: true });
  await mkdir(checkout.root, { recursive: true });
  const state = (await loadState(f.third.home))!;
  state.approved = [checkout];

  f.third.repo = createFakeRepoAdapter({
    checkoutAt: async () => checkout,
    ensureIgnored: async () => {},
    caseInsensitive: async () => false,
  });

  await saveState(f.third.home, state);
  await pull(f.third, f.opts);

  return join(checkout.root, ".env");
}
