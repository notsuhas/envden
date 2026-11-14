import { join } from "node:path";
import { acceptsEnvPath } from "@envden/core/adapters";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../../adapters.ts";
import { loadState } from "../../../state/store/repository.ts";
import { binary, text } from "../../../client/encoding.ts";
import { checkoutApproval } from "../../../links/approval.ts";
import { readConfig } from "../../../settings/config.ts";
import { conflictRecords } from "../conflicts.ts";
import { appliedFiles } from "../applied.ts";
import { basePath, readBytes } from "../files.ts";

export async function heldBackFiles(adapters: TAdapters) {
  const state = await loadState(adapters.home);
  const notices: { path: string; reason: string }[] = [];
  if (!state) return notices;
  const rules = (await readConfig(adapters.home))["env-files"];
  const conflicts = await conflictRecords(adapters.home);
  const applied = await appliedFiles(adapters.home);
  const key = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  const entries = state.files ? p.decode(p.FilesCodec, binary(state.files)).entries : [];

  for (const link of state.links) {
    if (link.localOnly) continue;
    const checkout = await adapters.repo.checkoutAt(link.root);
    const approved = state.approved.find((item) => item.root === link.root);

    const id =
      approved && key
        ? p.fileId(key, state.aliases[approved.repoId] ?? approved.repoId, link.path)
        : undefined;

    const entry = id && entries.find((item) => p.equal(item.fileId, id));

    const reason = reasonFor({
      approval: !!checkout && checkoutApproval(state, checkout) === "approved",
      included: acceptsEnvPath(link.path, rules),
      conflict: conflicts.some((record) => record.store === link.store),
      pending: (await readBytes(basePath(adapters.home, link.store) + ".pending")) !== undefined,
      unapplied: !!entry && applied[p.base32(entry.fileId)] !== text(p.FileEntryCodec.write(entry)),
      lost: !entry && link.mode === "link" && (await readBytes(link.store)) === undefined,
    });

    if (reason) notices.push({ path: join(link.root, link.path), reason });
  }

  return notices;
}

function reasonFor(input: {
  approval: boolean;
  included: boolean;
  conflict: boolean;
  pending: boolean;
  unapplied: boolean;
  lost: boolean;
}) {
  if (!input.approval) return "checkout needs approval; run envden track";
  if (!input.included) return "excluded by env-files; update envden config env-files";
  if (input.conflict) return "conflict; run envden resolve --list";
  if (input.lost) return "content was lost outside envden; restore from backup or untrack";
  if (input.pending || input.unapplied) return "placement incomplete; run envden pull";

  return undefined;
}
