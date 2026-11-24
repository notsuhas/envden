import { EnvdenError } from "@envden/core/errors";
import { VAULT_QUOTA_BYTES, type IStorageAdapter, type IStoredHeader } from "@envden/core/adapters";
import { createData, equal, hex } from "./data.ts";
import type { IMemoryContext } from "./data.ts";
import { createAccess } from "./access.ts";
import { createJoinRequests } from "./join-requests.ts";
import { createHistory } from "./history.ts";
import { createCommit } from "./commit.ts";
import { vaultUsage } from "./usage.ts";
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
    vaultIds: () =>
      [...context.data.vaults.keys()].map((key) => new Uint8Array(Buffer.from(key, "hex"))),
    findCommitted: (vault, digest) => context.data.digests.has(`${hex(vault)}:${hex(digest)}`),
    hasBlob: (vault, hash) => context.data.blobs.has(`${hex(vault)}:${hex(hash)}`),
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

      for (const map of [data.vaults, data.heads, data.headers, data.entries, data.currentFiles])
        map.delete(prefix);

      for (const map of [data.lists, data.states, data.devices, data.blobs, data.approvers])
        deletePrefix(map, `${prefix}:`);

      discardIndexes(context, prefix);
    },
    head: (vault) => context.data.heads.get(hex(vault))?.slice(),
    headers: (vault, from, to, limit, maxBytes) =>
      rangeRows(context.data.headers.get(hex(vault)) ?? [], from, to, limit, maxBytes),
    header: (vault, hash) =>
      structuredClone(
        context.data.headers.get(hex(vault))?.find((header) => equal(header.hash, hash)),
      ),
    entries: (vault, from, to, limit, maxBytes) =>
      rangeRows(context.data.entries.get(hex(vault)) ?? [], from, to, limit, maxBytes),
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
    putBlob(vault, hash, bytes, verify, now = 0, quotaBytes = VAULT_QUOTA_BYTES) {
      if (verify && !equal(verify(bytes), hash)) throw new Error("Blob hash mismatch");
      const key = `${hex(vault)}:${hex(hash)}`;
      const prior = context.data.blobs.get(key);
      if (prior && !equal(prior.bytes, bytes)) throw new Error("Conflicting blob");

      const used = [...context.data.blobs.values()]
        .filter((blob) => blob.vault === hex(vault))
        .reduce((size, blob) => size + blob.bytes.length, 0);

      if (used - (prior?.bytes.length ?? 0) + bytes.length > quotaBytes)
        throw new EnvdenError("STORAGE_QUOTA", "Vault storage quota exceeded");

      context.data.blobs.set(key, {
        vault: hex(vault),
        hash: hash.slice(),
        bytes: bytes.slice(),
        at: now,
      });
    },
    getBlob: (vault, hash) => context.data.blobs.get(`${hex(vault)}:${hex(hash)}`)?.bytes.slice(),
    blobHashes: (vault) =>
      [...context.data.blobs.values()]
        .filter((blob) => blob.vault === hex(vault))
        .map((blob) => blob.hash.slice()),
    vaultUsage: (vault) => vaultUsage(context, hex(vault)),
    setupToken: () => context.data.setup.get("token")?.slice(),
    setSetupToken(hash) {
      context.data.setup.set("token", hash.slice());
    },
    ...createAccess(context),
    ...createJoinRequests(context),
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

  for (const [number, request] of data.joinRequests)
    if (request.claim && hex(request.claim.vault) === prefix) data.joinRequests.delete(number);
}

function boundedRows<T extends { bytes: Uint8Array }>(
  rows: T[],
  maxBytes = Number.MAX_SAFE_INTEGER,
): T[] {
  let size = 0;

  return structuredClone(
    rows.filter((row, index) => {
      size += row.bytes.length;

      return size <= maxBytes || index === 0;
    }),
  );
}

function rangeRows(
  rows: IStoredHeader[],
  from: bigint,
  to: bigint,
  limit?: number,
  maxBytes?: number,
): IStoredHeader[] {
  return boundedRows(
    rows
      .filter((row) => row.seq >= from && row.seq <= to)
      .sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0))
      .slice(0, limit),
    maxBytes,
  );
}
