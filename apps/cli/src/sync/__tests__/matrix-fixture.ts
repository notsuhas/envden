import { createFakeRepoAdapter } from "@envden/testing/repo";
import { join } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import type { syncFixture } from "./flows.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { setConfig } from "../../settings/config.ts";
import { basePath, readBytes, writeBytes } from "../local/files.ts";
import { storePath } from "../../store/path.ts";
import { pull, push } from "../engine.ts";
import { conflictRecords } from "../local/conflicts.ts";

export const values = ["TOKEN=local-test-value\n", "TOKEN=X\n", "TOKEN=Y\n", undefined] as const;
export const remotes = ["unchanged", "changed", "deleted", "applied", "unpublished"] as const;

export const layouts = [
  ["link"],
  ["copy"],
  ["link", "copy"],
  ["copy", "copy"],
  ["link", "link"],
] as const;

function bytes(value: string | undefined) {
  return value === undefined ? undefined : new TextEncoder().encode(value);
}

export function combinations(count: number): (typeof values)[number][][] {
  if (!count) return [[]];

  return combinations(count - 1).flatMap((row) => values.map((value) => [...row, value]));
}

export function matrixFixture(
  modes: readonly ("link" | "copy")[],
  remote: (typeof remotes)[number],
  f: Awaited<ReturnType<typeof syncFixture>>,
) {
  const rows = combinations(1 + modes.filter((mode) => mode === "copy").length);
  const paths = rows.map((_, i) => `.env.case-${i}`);

  const targets = modes.map((mode, i) => ({
    ...f.checkoutB,
    root: join(f.root, `target-${i}`),
    mode,
  }));

  return {
    seedRemote: () => seedRemote(f, paths, remote),
    approveTargets: () => approveTargets(f, targets),
    changeRemote: () => changeRemote(f, paths, remote),
    seedCases: async () => ({ ...f, cases: await seedCases(f, targets, paths, rows, remote) }),
  };
}

export type TMatrix = Awaited<ReturnType<ReturnType<typeof matrixFixture>["seedCases"]>>;

async function approveTargets(
  f: Awaited<ReturnType<typeof syncFixture>>,
  targets: (typeof f.checkoutB & { mode: "copy" | "link" })[],
) {
  const state = (await loadState(f.second.home))!;

  for (const target of targets) target.gitDir = join(target.root, ".git");

  f.second.repo = createFakeRepoAdapter({
    checkoutAt: async (root) => targets.find((item) => item.root === root),
    caseInsensitive: async () => false,
    ensureIgnored: async () => {},
  });

  state.approved = targets;
  await saveState(f.second.home, state);

  await setConfig(
    "placement",
    JSON.stringify(Object.fromEntries(targets.map((item) => [item.root, item.mode]))),
    f.second.home,
  );

  for (const target of targets) await mkdir(target.root, { recursive: true });
  await pull(f.second, f.opts);
}

async function seedRemote(
  f: Awaited<ReturnType<typeof syncFixture>>,
  paths: string[],
  remote: (typeof remotes)[number],
) {
  const first = (await loadState(f.first.home))!;

  for (const path of paths) {
    const store = storePath(f.first.home, f.checkout.repoId, path);
    await writeBytes(store, bytes(values[0]));
    await f.first.placement("link", f.checkout.root).place(store, join(f.checkout.root, path));
    first.links.push({ root: f.checkout.root, path, store, mode: "link" });
  }

  await saveState(f.first.home, first);
  if (remote !== "unpublished") await push(f.first, f.opts);
}

async function changeRemote(
  f: Awaited<ReturnType<typeof syncFixture>>,
  paths: string[],
  remote: (typeof remotes)[number],
) {
  if (remote === "changed" || remote === "deleted" || remote === "applied") {
    for (const path of paths)
      await writeBytes(
        storePath(f.first.home, f.checkout.repoId, path),
        remote === "changed" ? bytes("TOKEN=R\n") : undefined,
      );

    await push(f.first, f.opts);
    if (remote === "applied") await pull(f.second, f.opts);
  }
}

async function seedCases(
  f: Awaited<ReturnType<typeof syncFixture>>,
  targets: { root: string; mode: "link" | "copy" }[],
  paths: string[],
  rows: (typeof values)[number][][],
  remote: (typeof remotes)[number],
) {
  const local = (await loadState(f.second.home))!;
  const cases = [];

  for (const [i, path] of paths.entries()) {
    const store = storePath(f.second.home, f.checkout.repoId, path);
    const links = targets.map((item) => ({ root: item.root, path, store, mode: item.mode }));
    if (remote === "applied" || remote === "unpublished") local.links.push(...links);
    const row = rows[i]!;
    await writeBytes(store, bytes(row[0]));
    await seedTargets(f, links, row, remote);

    cases.push({ path, store, links, row });
  }

  await saveState(f.second.home, local);

  return cases;
}

export async function survivingContent(home: string, item: TMatrix["cases"][number]) {
  const paths = [
    item.store,
    ...item.links.filter((link) => link.mode === "copy").map((link) => join(link.root, link.path)),
  ];

  for (const record of await conflictRecords(home))
    if (record.store === item.store)
      paths.push(record.mine, record.server, record.file, ...record.alternatives);

  const directory = join(home, "conflicts", "backups");
  for (const name of await readdir(directory).catch(() => [])) paths.push(join(directory, name));

  return Promise.all(
    paths.map(async (path) => {
      const content = await readBytes(path);

      return content === undefined ? undefined : new TextDecoder().decode(content);
    }),
  );
}

async function seedTargets(
  f: Awaited<ReturnType<typeof syncFixture>>,
  links: { root: string; path: string; store: string; mode: "link" | "copy" }[],
  row: (typeof values)[number][],
  remote: (typeof remotes)[number],
) {
  let index = 1;

  for (const link of links) {
    if (link.mode === "copy") {
      await writeBytes(
        basePath(f.second.home, link.store, link.root),
        remote === "applied" ? undefined : bytes(values[0]),
      );

      await writeBytes(join(link.root, link.path), bytes(row[index++]));
    } else if (row[0] !== undefined)
      await f.second.placement("link", link.root).place(link.store, join(link.root, link.path));
  }
}
