import type { IStorageAdapter } from "@envden/core/adapters";
import { createData, equal, hex } from "./data.ts";
import type { IMemoryContext } from "./data.ts";
import { createAccess } from "./access.ts";
import { createMailboxes } from "./mailboxes.ts";
import { createHistory } from "./history.ts";
import { createCommit } from "./commit.ts";
import { createFakeStorageAdapter } from "../fake.ts";

export function createMemoryStorageAdapter(
  operations: readonly (keyof IStorageAdapter)[],
): IStorageAdapter {
  const context: IMemoryContext = { data: createData(), depth: 0 };

  const methods: IStorageAdapter = {
    id: "memory",
    close() {},
    transaction(run) {
      const snapshot = structuredClone(context.data);
      context.depth++;

      try {
        return run();
      } catch (error) {
        context.data = snapshot;
        throw error;
      } finally {
        context.depth--;
      }
    },
    hasVault: (vault) => context.data.vaults.has(hex(vault)),
    vault: (vault) => structuredClone(context.data.vaults.get(hex(vault))),
    configureVault(vault, state, writes = [], setupTokenHash) {
      methods.transaction(() => {
        if (
          setupTokenHash &&
          (methods.hasVault(vault) || !equal(methods.setupToken(), setupTokenHash))
        )
          throw new Error("Setup token changed, consumed, or vault exists");

        context.data.vaults.set(hex(vault), structuredClone(state));
        methods.writeState(vault, writes);
        if (setupTokenHash) context.data.setup.delete("token");
      });
    },
    discardInactiveVault(vault) {
      if (methods.vault(vault)?.active) throw new Error("Cannot discard an active vault");
      const data = context.data;
      const prefix = hex(vault);

      for (const map of [
        data.vaults,
        data.heads,
        data.headers,
        data.entries,
        data.currentFiles,
        data.openings,
      ])
        map.delete(prefix);

      for (const map of [data.lists, data.states, data.devices, data.blobs, data.approvers])
        deletePrefix(map, `${prefix}:`);

      discardIndexes(context, prefix);
    },
    head: (vault) => context.data.heads.get(hex(vault))?.slice(),
    headers: (vault, from, to) =>
      structuredClone(
        (context.data.headers.get(hex(vault)) ?? [])
          .filter((header) => header.seq >= from && header.seq <= to)
          .sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0)),
      ),
    header: (vault, hash) =>
      structuredClone(
        context.data.headers.get(hex(vault))?.find((header) => equal(header.hash, hash)),
      ),
    entries: (vault, from, to) =>
      structuredClone(
        (context.data.entries.get(hex(vault)) ?? [])
          .filter((entry) => entry.seq >= from && entry.seq <= to)
          .sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0)),
      ),
    fileList: (vault, hash) =>
      context.data.lists.get(`${hex(vault)}:${hex(hash)}`)?.files.bytes.slice(),
    state: (vault, kind, key) =>
      context.data.states.get(`${hex(vault)}:${kind}:${hex(key)}`)?.bytes.slice(),
    states: (vault, kind) =>
      [...context.data.states.values()]
        .filter((entry) => entry.vault === hex(vault) && entry.kind === kind)
        .map(({ key, bytes }) => ({ key: key.slice(), bytes: bytes.slice() })),
    writeState(vault, writes) {
      for (const write of writes) {
        const key = `${hex(vault)}:${write.kind}:${hex(write.key)}`;

        if (write.bytes)
          context.data.states.set(key, {
            vault: hex(vault),
            kind: write.kind,
            key: write.key.slice(),
            bytes: write.bytes.slice(),
          });
        else context.data.states.delete(key);
      }
    },
    device: (vault, device) =>
      structuredClone(context.data.devices.get(`${hex(vault)}:${hex(device)}`)),
    putDevice(vault, device, state) {
      context.data.devices.set(`${hex(vault)}:${hex(device)}`, structuredClone(state));
    },
    putBlob(vault, hash, bytes, verify) {
      if (verify && !equal(verify(bytes), hash)) throw new Error("Blob hash mismatch");
      const key = `${hex(vault)}:${hex(hash)}`;
      const prior = context.data.blobs.get(key);
      if (prior && !equal(prior.bytes, bytes)) throw new Error("Conflicting blob");
      context.data.blobs.set(key, { vault: hex(vault), hash: hash.slice(), bytes: bytes.slice() });
    },
    getBlob: (vault, hash) => context.data.blobs.get(`${hex(vault)}:${hex(hash)}`)?.bytes.slice(),
    blobHashes: (vault) =>
      [...context.data.blobs.values()]
        .filter((blob) => blob.vault === hex(vault))
        .map((blob) => blob.hash.slice()),
    setupToken: () => context.data.setup.get("token")?.slice(),
    setSetupToken(hash) {
      context.data.setup.set("token", hash.slice());
    },
    ...createAccess(context),
    ...createMailboxes(context),
    ...createHistory(context),
    commitSwap: (...args) => createCommit(context, methods)(...args),
  };

  const selected: Partial<IStorageAdapter> = { id: "memory" };
  for (const key of operations) selectOperation(selected, methods, key);

  return createFakeStorageAdapter(selected);
}

function selectOperation<K extends keyof IStorageAdapter>(
  selected: Partial<IStorageAdapter>,
  methods: IStorageAdapter,
  key: K,
) {
  const value = methods[key];
  Object.assign(selected, { [key]: typeof value === "function" ? value.bind(methods) : value });
}

function deletePrefix(map: Map<string, unknown>, prefix: string) {
  for (const key of map.keys()) if (key.startsWith(prefix)) map.delete(key);
}

function discardIndexes(context: IMemoryContext, prefix: string) {
  const data = context.data;

  for (const key of data.sessions.keys())
    if (key.startsWith(`["${prefix}",`)) data.sessions.delete(key);

  for (const key of data.digests) if (key.startsWith(`${prefix}:`)) data.digests.delete(key);

  for (const [number, mailbox] of data.mailboxes)
    if (mailbox.vault === prefix) data.mailboxes.delete(number);
}
