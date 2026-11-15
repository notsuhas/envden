import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { dirname, relative, resolve, sep } from "node:path";
import { placeInRoot } from "@envden/core/paths";
import type { ILocalState } from "../../state/model.ts";

type TLink = ILocalState["links"][number];

export interface IHistoryTarget {
  root: string;
  path: string;
  repoId: string;
  link?: TLink;
}

export function historyTargets(
  state: ILocalState,
  repos: ReadonlySet<string>,
  options: { cwd: string; file?: string; all?: boolean },
): IHistoryTarget[] {
  const approved = state.approved
    .map((item) => ({ root: item.root, repoId: state.aliases[item.repoId] ?? item.repoId }))
    .filter((item) => repos.has(item.repoId));

  if (options.file !== undefined) return [fileTarget(state, approved, options.cwd, options.file)];

  const inside = deepest(approved, options.cwd);
  const roots = options.all ? approved : inside ? [inside] : [];

  return roots.flatMap((checkout) =>
    state.links
      .filter((link) => link.root === checkout.root && !link.localOnly)
      .map((link) => ({ root: link.root, path: link.path, repoId: checkout.repoId, link })),
  );
}

// A named file selects its own checkout, wherever the command runs.
export function selectionDirectory(options: { cwd: string; file?: string }) {
  return options.file === undefined ? options.cwd : dirname(resolve(options.cwd, options.file));
}

function fileTarget(
  state: ILocalState,
  approved: { root: string; repoId: string }[],
  cwd: string,
  file: string,
): IHistoryTarget {
  const absolute = resolve(cwd, file);
  const checkout = deepest(approved, absolute);
  if (!checkout) throw new EnvdenError("NOT_FOUND", "File is not in an approved checkout");

  const path = relative(checkout.root, absolute).split(sep).join("/");

  try {
    p.validatePath(path);
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "Name an env file inside the checkout", { cause });
  }

  const link = state.links.find((item) => item.root === checkout.root && item.path === path);

  return { root: checkout.root, path, repoId: checkout.repoId, ...(link ? { link } : {}) };
}

function deepest<T extends { root: string }>(checkouts: T[], path: string) {
  return checkouts
    .filter((checkout) => placeInRoot(checkout.root, path) !== "outside")
    .sort((a, b) => b.root.length - a.root.length)[0];
}
