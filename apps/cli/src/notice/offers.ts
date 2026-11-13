import { join } from "node:path";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite, optionalRead } from "../state/files.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";

export async function cacheOffers(
  adapters: TAdapters,
  state: ILocalState,
  cwd: string | undefined,
  update: { available: boolean; required: boolean },
) {
  const path = join(adapters.home, "state", "track-offers");
  const roots = new Set(((await optionalRead(path)) ?? "").split("\n").filter(safeRoot));

  if (cwd) {
    const checkout = await adapters.repo.checkoutAt(cwd).catch(() => undefined);

    if (
      checkout &&
      safeRoot(checkout.root) &&
      !state.approved.some((item) => item.root === checkout.root) &&
      (await adapters.repo.envFiles(checkout)).length
    )
      roots.add(checkout.root);
  }

  const pending = [...roots].filter((root) => !state.approved.some((item) => item.root === root));
  await atomicWrite(path, pending.join("\n") + (pending.length ? "\n" : ""));
  const lines = [];
  if (update.available) lines.push("envden: update available; run envden update");
  if (update.required) lines.push("envden: update required; run envden update");

  await atomicWrite(
    join(adapters.home, "state", "notice-update"),
    lines.join("\n") + (lines.length ? "\n" : ""),
  );
}

function safeRoot(root: string) {
  return !!root && sanitizeTerminal(root) === root && !/[\r\n]/.test(root);
}
