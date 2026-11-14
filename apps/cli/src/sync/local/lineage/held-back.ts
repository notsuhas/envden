import { deletionRequested } from "../reconciliation/operation/deletion.ts";
import { readAttempts } from "../../remote/attempt/state.ts";
import { readOperation } from "../reconciliation/operation/record.ts";
import { recoverSyncRecord } from "../../../state/store/records.ts";
import { fileSizeNotice } from "../validation/size.ts";
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
  await readAttempts(adapters, state.links);
  const rules = (await readConfig(adapters.home))["env-files"];
  const conflicts = await conflictRecords(adapters.home);
  const applied = await appliedFiles(adapters.home);
  const key = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  const entries = state.files ? p.decode(p.FilesCodec, binary(state.files)).entries : [];

  const context = { adapters, state, rules, conflicts, applied, key, entries };

  for (const link of state.links) {
    if (link.localOnly) continue;
    const reason = await linkReason(context, link);
    if (reason) notices.push({ path: join(link.root, link.path), reason });
  }

  return notices;
}

async function linkReason(
  {
    adapters,
    state,
    rules,
    conflicts,
    applied,
    key,
    entries,
  }: {
    adapters: TAdapters;
    state: NonNullable<Awaited<ReturnType<typeof loadState>>>;
    rules: Awaited<ReturnType<typeof readConfig>>["env-files"];
    conflicts: Awaited<ReturnType<typeof conflictRecords>>;
    applied: Record<string, string>;
    key: Uint8Array | undefined;
    entries: p.IFileEntry[];
  },
  link: NonNullable<Awaited<ReturnType<typeof loadState>>>["links"][number],
) {
  const checkout = await adapters.repo.checkoutAt(link.root);
  const entry = knownEntry({ adapters, state, rules, conflicts, applied, key, entries }, link);

  const stored = await readBytes(link.store);

  const base = basePath(adapters.home, link.store);

  await recoverSyncRecord(base + ".entry", base + ".corrupt", (saved) =>
    p.decode(p.FileEntryCodec, binary(saved)),
  );

  await readOperation(base + ".pending");
  await deletionRequested(adapters.home, link.store);
  const corrupt = (await readBytes(base + ".corrupt")) !== undefined;

  const reason = corrupt
    ? "invalid sync state; run envden pull, then envden resolve --list"
    : reasonFor({
        oversized: fileSizeNotice(link.path, stored) !== undefined,
        approval: !!checkout && checkoutApproval(state, checkout) === "approved",
        included: acceptsEnvPath(link.path, rules),
        conflict: conflicts.some((record) => record.store === link.store),
        pending: (await readBytes(basePath(adapters.home, link.store) + ".pending")) !== undefined,
        unapplied:
          !!entry && applied[p.base32(entry.fileId)] !== text(p.FileEntryCodec.write(entry)),
        lost: !entry && link.mode === "link" && stored === undefined,
      });

  return reason;
}

function knownEntry(
  context: Parameters<typeof linkReason>[0],
  link: Parameters<typeof linkReason>[1],
) {
  const { state, key, entries } = context;
  const approved = state.approved.find((item) => item.root === link.root);

  const id =
    approved && key
      ? p.fileId(key, state.aliases[approved.repoId] ?? approved.repoId, link.path)
      : undefined;

  const entry = id && entries.find((item) => p.equal(item.fileId, id));

  return entry;
}

function reasonFor(input: {
  oversized: boolean;
  approval: boolean;
  included: boolean;
  conflict: boolean;
  pending: boolean;
  unapplied: boolean;
  lost: boolean;
}) {
  if (input.oversized) return "file exceeds 1 MiB; reduce its size before pushing";
  if (!input.approval) return "checkout needs approval; run envden track";
  if (!input.included) return "excluded by env-files; update envden config env-files";
  if (input.conflict) return "conflict; run envden resolve --list";
  if (input.lost) return "content was lost outside envden; restore from backup or untrack";
  if (input.pending || input.unapplied) return "placement incomplete; run envden pull";

  return undefined;
}
