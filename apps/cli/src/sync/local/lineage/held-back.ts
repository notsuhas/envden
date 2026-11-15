import { decodeDeletion } from "../reconciliation/operation/deletion.ts";
import { invalidAttemptState } from "../../remote/attempt/state.ts";
import { decodeOperation } from "../reconciliation/operation/record.ts";
import { invalidSyncRecord } from "../../../state/store/records.ts";
import { fileSizeNotice } from "../validation/size.ts";
import { join } from "node:path";
import { acceptsEnvPath } from "@envden/core/adapters";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../../adapters.ts";
import { loadState } from "../../../state/store/repository.ts";
import { binary, text } from "../../../client/encoding.ts";
import { approvedCheckout } from "../../../links/approval.ts";
import { readConfig } from "../../../settings/config.ts";
import { conflictRecords } from "../conflicts.ts";
import { appliedFiles } from "../applied.ts";
import { basePath, readBytes } from "../files.ts";
import { heldBackReasons, type THeldBack } from "./reasons.ts";

export async function heldBackFiles(adapters: TAdapters) {
  const state = await loadState(adapters.home);
  const notices: { path: string; kind: THeldBack; reason: string }[] = [];
  if (!state) return notices;
  const invalidAttempt = await invalidAttemptState(adapters.home);
  const rules = (await readConfig(adapters.home))["env-files"];
  const conflicts = await conflictRecords(adapters.home);
  const applied = await appliedFiles(adapters.home);
  const key = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  const entries = state.files ? p.decode(p.FilesCodec, binary(state.files)).entries : [];

  const context = { adapters, state, rules, conflicts, applied, key, entries, invalidAttempt };

  for (const link of state.links) {
    if (link.localOnly) continue;
    const kind = await linkReason(context, link);

    if (kind)
      notices.push({ path: join(link.root, link.path), kind, reason: heldBackReasons[kind] });
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
    invalidAttempt,
  }: {
    adapters: TAdapters;
    state: NonNullable<Awaited<ReturnType<typeof loadState>>>;
    rules: Awaited<ReturnType<typeof readConfig>>["env-files"];
    conflicts: Awaited<ReturnType<typeof conflictRecords>>;
    applied: Record<string, string>;
    key: Uint8Array | undefined;
    entries: p.IFileEntry[];
    invalidAttempt: boolean;
  },
  link: NonNullable<Awaited<ReturnType<typeof loadState>>>["links"][number],
) {
  const entry = knownEntry(
    { adapters, state, rules, conflicts, applied, key, entries, invalidAttempt },
    link,
  );

  const stored = await readBytes(link.store);

  const base = basePath(adapters.home, link.store);

  const invalidEntry = await invalidSyncRecord(base + ".entry", (saved) =>
    p.decode(p.FileEntryCodec, binary(saved)),
  );

  const invalidPending = await invalidSyncRecord(base + ".pending", decodeOperation);

  const invalidDeletion = await invalidSyncRecord(base + ".delete", decodeDeletion);

  const corrupt = [
    invalidAttempt,
    invalidEntry,
    invalidPending,
    invalidDeletion,
    (await readBytes(base + ".corrupt")) !== undefined,
  ].some(Boolean);

  const reason: THeldBack | undefined = corrupt
    ? "invalid-state"
    : reasonFor({
        oversized: fileSizeNotice(link.path, stored) !== undefined,
        approval: !!(await approvedCheckout(adapters.repo, state, link.root)),
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
}): THeldBack | undefined {
  if (input.oversized) return "oversized";
  if (!input.approval) return "needs-approval";
  if (!input.included) return "excluded";
  if (input.conflict) return "conflict";
  if (input.lost) return "lost";
  if (input.pending || input.unapplied) return "incomplete";

  return undefined;
}
