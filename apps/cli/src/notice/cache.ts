import { withStateLock } from "../state/lock/lock.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";
import { readRemoteNotice } from "./remote.ts";
import { join } from "node:path";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { basePath, readBytes, same } from "../sync/local/files.ts";
import { templateChecks } from "../templates/checks.ts";
import { templateNoticeLines } from "../templates/notice.ts";
import { changedFileLine } from "./changes/lines.ts";

export const WAITING_NOTICE = "envden: a device is waiting to join; run envden device approve";

export async function noticeStatus(home: string, state: ILocalState) {
  const repos = new Set<string>();

  for (const link of state.links) {
    if (link.localOnly) continue;

    const base = await readBytes(
      basePath(home, link.store, link.mode === "copy" ? link.root : undefined),
    );

    const local = await readBytes(link.mode === "link" ? link.store : join(link.root, link.path));

    if (!same(base, local)) {
      const checkout = state.approved.find((item) => item.root === link.root);
      if (checkout) repos.add(state.aliases[checkout.repoId] ?? checkout.repoId);
    }
  }

  return [...repos].map((repoId) => ({ repoId, status: "local changes" }));
}

async function lockedrefreshNotice(
  home: string,
  state: ILocalState,
  caseInsensitive: (root: string) => Promise<boolean>,
  now: () => number,
): Promise<void> {
  const roots = state.approved
    .map((item) => item.root)
    .filter((root) => sanitizeTerminal(root) === root && !/[\r\n]/.test(root));

  await atomicWrite(join(home, "state", "approved-checkouts"), roots.join("\n") + "\n", now);

  const insensitive = await Promise.all(
    roots.map(async (root) =>
      (await caseInsensitive(root).catch(() => false)) ? root : undefined,
    ),
  );

  await atomicWrite(
    join(home, "state", "approved-checkouts-insensitive"),
    insensitive.filter((root) => root !== undefined).join("\n") + "\n",
    now,
  );

  const local = await noticeStatus(home, state);
  const remote = await readRemoteNotice(home);

  const lines = [
    ...local.map((item) => `envden: ${item.repoId} out of sync`),
    ...(remote?.files ?? []).map(changedFileLine),
    ...templateNoticeLines(await templateChecks(state)),
  ].map(sanitizeTerminal);

  if (remote?.waiting) lines.push(WAITING_NOTICE);

  await atomicWrite(
    join(home, "state", "notice"),
    lines.join("\n") + (lines.length ? "\n" : ""),
    now,
  );
}

export async function cachedNotice(home: string): Promise<string> {
  return ((await optionalRead(join(home, "state", "notice"))) ?? "")
    .split("\n")
    .map(sanitizeTerminal)
    .join("\n");
}

export function refreshNotice(...args: Parameters<typeof lockedrefreshNotice>) {
  return withStateLock(args[0], () => lockedrefreshNotice(...args));
}
