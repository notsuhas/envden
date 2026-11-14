import { checkQuota, vaultUsage } from "../db/quota.ts";
import { prepareCommit, writeCommitState } from "@envden/core/adapters";
import type { IStorageAdapter, IStoredSwap } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";
import { equal, seq } from "../db/values.ts";

export function createSwapCommit(
  context: TContext,
  storage: Pick<
    IStorageAdapter,
    | "closeMailbox"
    | "configureVault"
    | "consumeSession"
    | "hasVault"
    | "head"
    | "mailbox"
    | "putDevice"
    | "setupToken"
    | "writeState"
  >,
) {
  const { db, bytes, run } = context;

  function commitSwap(
    vault: Uint8Array,
    expected: Uint8Array | undefined,
    swap: IStoredSwap,
    now: number,
  ) {
    return db
      .transaction(() => {
        if (
          bytes(
            "SELECT digest AS bytes FROM digests WHERE vault=? AND digest=?",
            vault,
            swap.bodyDigest,
          )
        )
          return { kind: "retry-of-committed" } as const;

        const head = storage.head(vault);

        if (!equal(head, expected))
          return { kind: "head-moved", ...(head ? { head } : {}) } as const;

        const before = vaultUsage(context, vault);

        prepareCommit(storage, vault, swap, now);

        const priorFiles = bytes(
          "SELECT files AS bytes FROM headers WHERE vault=? ORDER BY seq DESC LIMIT 1",
          vault,
        );

        writeFiles(context, vault, swap, now, priorFiles);

        const filesHash = currentFilesHash(swap, priorFiles);
        if (filesHash) run("UPDATE lists SET at=? WHERE vault=? AND hash=?", now, vault, filesHash);

        run(
          "INSERT INTO headers VALUES(?,?,?,?,?,?)",
          vault,
          seq(swap.header.seq),
          swap.header.hash,
          swap.header.bytes,
          now,
          filesHash ?? null,
        );

        for (const entry of swap.entries)
          run(
            "INSERT INTO entries VALUES(?,?,?,?)",
            vault,
            seq(entry.seq),
            entry.hash,
            entry.bytes,
          );

        checkQuota(context, vault, before);

        writeCommitState(storage, vault, swap);

        writeMetadata(context, storage, vault, swap, now);

        run("INSERT INTO digests VALUES(?,?)", vault, swap.bodyDigest);
        run("UPDATE vaults SET head=? WHERE id=?", swap.header.hash, vault);

        return { kind: "committed" } as const;
      })
      .immediate();
  }

  function findCommitted(vault: Uint8Array, digest: Uint8Array): boolean {
    return !!bytes("SELECT digest AS bytes FROM digests WHERE vault=? AND digest=?", vault, digest);
  }

  return { commitSwap, findCommitted };
}

function writeFiles(
  context: TContext,
  vault: Uint8Array,
  swap: IStoredSwap,
  now: number,
  priorFiles: Uint8Array | undefined,
) {
  const { run } = context;

  if (swap.files) {
    run(
      "INSERT INTO lists VALUES(?,?,?,?,?) ON CONFLICT(vault,hash) DO UPDATE SET at=excluded.at,permanent=MAX(permanent,excluded.permanent)",
      vault,
      swap.files.hash,
      swap.files.bytes,
      now,
      +(swap.files.retainForever ?? false),
    );

    for (const version of swap.files.versions)
      run(
        "INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?,?)",
        vault,
        swap.files.hash,
        version.fileId,
        seq(version.version),
        version.blobHash ?? null,
        +version.tombstone,
      );

    if (swap.files.retainForever && priorFiles)
      run("UPDATE lists SET permanent=1 WHERE vault=? AND hash=?", vault, priorFiles);
  }
}

function writeMetadata(
  context: TContext,
  storage: Pick<IStorageAdapter, "closeMailbox">,
  vault: Uint8Array,
  swap: IStoredSwap,
  now: number,
) {
  const { run } = context;

  if (swap.approver)
    run(
      "INSERT OR REPLACE INTO approvers VALUES(?,?,?,?)",
      vault,
      swap.approver.device,
      swap.approver.bytes,
      now + 86400000,
    );

  if (swap.clearRepairReports)
    run("DELETE FROM state WHERE vault=? AND kind='repair-report'", vault);

  if (swap.closeMailbox !== undefined) storage.closeMailbox(vault, swap.closeMailbox);
  if (swap.setupTokenHash) run("DELETE FROM setup");
}

function currentFilesHash(swap: IStoredSwap, priorFiles: Uint8Array | undefined) {
  return swap.filesHash ?? swap.files?.hash ?? priorFiles;
}
