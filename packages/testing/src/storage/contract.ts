import { blobStagingContract } from "./staging-contract.ts";
import { describe, expect, test } from "bun:test";
import type {
  IStorageAdapter,
  IStoredSwap,
  IStoredVault,
  ISessionKey,
} from "@envden/core/adapters";

interface IStorageFixture {
  storage: IStorageAdapter;
  reopen(): IStorageAdapter;
  dispose(): void;
}

const b = (value: number) => new Uint8Array([value]);
const vault: IStoredVault = { active: true, frozen: false, skRefused: false, unlockPeriod: null };

function swap(value: number): IStoredSwap {
  return {
    header: { seq: BigInt(value), hash: b(value), bytes: b(value + 10) },
    entries: [],
    bodyDigest: b(value + 20),
    vault,
  };
}

export function storageContract(name: string, factory: () => IStorageFixture): void {
  describe(name, () => {
    function check(
      label: string,
      run: (db: IStorageAdapter, fixture: IStorageFixture) => void,
    ): void {
      test(label, () => {
        const fixture = factory();

        try {
          run(fixture.storage, fixture);
        } finally {
          fixture.dispose();
        }
      });
    }

    check("creation, token consumption and digest retries", (db) => {
      db.setSetupToken(b(90));
      const first = { ...swap(1), setupTokenHash: b(90) };
      expect(db.commitSwap(b(1), undefined, first, 0).kind).toBe("committed");
      expect(db.setupToken()).toBeUndefined();
      expect(db.findCommitted(b(1), first.bodyDigest)).toBe(true);
      expect(db.findCommitted(b(1), b(100))).toBe(false);
      expect(db.vaultIds()).toEqual([b(1)]);
      expect(db.commitSwap(b(1), undefined, first, 1).kind).toBe("retry-of-committed");
      expect(db.commitSwap(b(1), undefined, swap(2), 1).kind).toBe("head-moved");
    });

    check("uncommitted blobs expire and obey quota", blobStagingContract);

    check("discard removes inactive imports and refuses active vaults", (db) => {
      const session: ISessionKey = { kind: "login", device: b(2), purpose: "registration" };

      db.commitSwap(
        b(1),
        undefined,
        {
          ...swap(1),
          vault: { ...vault, active: false },
          state: [{ kind: "move-session", key: b(0), bytes: b(4) }],
        },
        0,
      );

      db.putSession(b(1), session, b(5), 0);
      db.putDevice(b(1), b(2), { clientVersion: "1.0.0", freshUntil: 0, unlockedUntil: 0 });
      db.discardInactiveVault(b(1));
      expect(db.hasVault(b(1))).toBe(false);
      expect(db.head(b(1))).toBeUndefined();
      expect(db.state(b(1), "move-session", b(0))).toBeUndefined();
      expect(db.session(b(1), session, 0)).toBeUndefined();
      expect(db.device(b(1), b(2))).toBeUndefined();
      expect(db.commitSwap(b(1), undefined, swap(1), 0).kind).toBe("committed");
      expect(() => db.discardInactiveVault(b(1))).toThrow("Cannot discard an active vault");
    });

    check("chain, credentials and devices survive reopening", (db, fixture) => {
      const first = {
        ...swap(1),
        entries: [{ seq: 0n, hash: b(40), bytes: b(41) }],
        files: { hash: b(50), bytes: b(51), versions: [] },
        state: (["keyring", "envelope", "skPub", "opaqueRecord"] as const).map((kind) => ({
          kind,
          key: b(0),
          bytes: b(60),
        })),
        devices: [
          { id: b(3), state: { unlockedUntil: 100, freshUntil: 50, clientVersion: "1.0.0" } },
        ],
      };

      db.commitSwap(b(1), undefined, first, 0);
      const next = fixture.reopen();
      expect(next.head(b(1))).toEqual(b(1));
      expect(next.headers(b(1), 0n, 2n)).toEqual([first.header]);
      expect(next.headers(b(1), 0n, 2n, 0)).toEqual([]);
      next.capUnlocks(b(1), 70);
      expect(next.device(b(1), b(3))?.unlockedUntil).toBe(70);
      next.capUnlocks(b(1), 90);
      expect(next.device(b(1), b(3))?.unlockedUntil).toBe(70);
      expect(next.header(b(1), b(1))).toEqual(first.header);
      expect(next.entries(b(1), 0n, 1n)).toEqual(first.entries);
      expect(next.fileList(b(1), b(50))).toEqual(b(51));
      expect(next.state(b(1), "opaqueRecord", b(0))).toEqual(b(60));
      expect(next.device(b(1), b(3))).toEqual({ ...first.devices[0]!.state, unlockedUntil: 70 });
      expect(next.head(b(2))).toBeUndefined();
    });

    check("failed commits roll back all state", (db) => {
      db.configureVault(b(1), vault);
      const key: ISessionKey = { kind: "login", device: b(2), purpose: "finish" };
      db.putSession(b(1), key, b(9), 0);
      db.commitSwap(b(1), undefined, swap(1), 0);

      const invalid = {
        ...swap(2),
        header: swap(1).header,
        consumeSessions: [key],
        vault: { ...vault, frozen: true },
      };

      expect(() => db.commitSwap(b(1), b(1), invalid, 1)).toThrow();
      expect(db.session(b(1), key, 1)).toEqual(b(9));
      expect(db.vault(b(1))?.frozen).toBe(false);
      expect(db.state(b(1), "opaqueRecord", b(0))).toBeUndefined();
      expect(db.head(b(1))).toEqual(b(1));
    });

    check("move and repair state survive reopening", (db, fixture) => {
      db.setSetupToken(b(8));

      db.configureVault(
        b(1),
        {
          ...vault,
          active: false,
          frozen: true,
          serverMoved: b(7),
          skRefused: true,
          restored: { repairTokenHash: b(6), restoredHead: b(5), finishProgress: b(4) },
        },
        [
          { kind: "move-session", key: b(1), bytes: b(3) },
          { kind: "repair-report", key: b(2), bytes: b(2) },
        ],
        b(8),
      );

      const next = fixture.reopen();
      expect(next.vault(b(1))?.restored?.finishProgress).toEqual(b(4));
      expect(next.states(b(1), "move-session")).toHaveLength(1);
      next.commitSwap(b(1), undefined, { ...swap(1), vault, clearRepairReports: true }, 0);
      expect(next.vault(b(1))?.restored).toBeUndefined();
      expect(next.states(b(1), "repair-report")).toEqual([]);
    });

    check("login states expire and are consumed once", (db) => {
      const key: ISessionKey = { kind: "login", device: b(1), purpose: "unlock" };
      db.putSession(b(1), key, b(9), 100);
      expect(db.session(b(1), { ...key, purpose: "kit" }, 101)).toBeUndefined();
      expect(db.session(b(2), key, 101)).toBeUndefined();
      expect(db.consumeSession(b(1), key, 120100)).toBeUndefined();
      db.putSession(b(1), key, b(9), 200);
      expect(db.consumeSession(b(1), key, 201)).toEqual(b(9));
      expect(db.consumeSession(b(1), key, 201)).toBeUndefined();
    });

    check("join tickets expire and commit consumes them", (db) => {
      const key: ISessionKey = { kind: "join-ticket", device: b(1), purpose: "join" };
      db.putSession(b(1), key, b(9), 0);
      expect(db.session(b(1), key, 599999)).toEqual(b(9));
      expect(db.session(b(1), key, 600000)).toBeUndefined();
      db.putSession(b(1), key, b(9), 0);
      db.commitSwap(b(1), undefined, { ...swap(1), vault, consumeSessions: [key] }, 1);
      expect(db.session(b(1), key, 2)).toBeUndefined();
    });

    check("nonces expire after ten minutes", (db) => {
      expect(db.rememberNonce(b(1), b(2), 0)).toBe(true);
      expect(db.rememberNonce(b(1), b(2), 1)).toBe(false);
      expect(db.rememberNonce(b(2), b(2), 1)).toBe(true);
      expect(db.rememberNonce(b(1), b(2), 600000)).toBe(true);
    });

    check("rate limits isolate, refund and double", (db) => {
      const bucket = { kind: "non-member" } as const;
      for (let i = 0; i < 5; i++) expect(db.charge(b(1), bucket, 0).kind).toBe("charged");
      expect(db.charge(b(1), bucket, 1)).toEqual({ kind: "locked", until: 900000 });
      expect(db.charge(b(2), bucket, 1).kind).toBe("charged");
      for (let i = 0; i < 5; i++) db.charge(b(1), bucket, 900000);
      expect(db.charge(b(1), bucket, 900001)).toEqual({ kind: "locked", until: 2700000 });
      const charge = db.charge(b(1), { kind: "member", device: b(4) }, 0);
      if (charge.kind !== "charged") throw new Error("Expected charge");
      expect(db.refund(charge.receipt, 1)).toBe(true);
      expect(db.refund(charge.receipt, 1)).toBe(false);
    });

    check("mailbox numbers and write-once slots", (db) => {
      const box = db.openMailbox(b(1), b(2), 0);
      expect(box?.number).toBe(1);
      expect(db.openMailbox(b(2), b(2), 0)?.number).toBe(2);
      expect(db.writeMailbox(b(1), 1, "PairJoiner", b(2), 1)).toBe("out-of-order");
      expect(db.writeMailbox(b(1), 1, "KE1", b(2), 1)).toBe("written");
      expect(db.writeMailbox(b(1), 1, "KE1", b(2), 1)).toBe("identical");
      expect(db.writeMailbox(b(1), 1, "KE1", b(3), 1)).toBe("closed");
      expect(db.openMailbox(b(1), b(2), 1)?.number).toBe(1);
      expect(db.mailbox(b(1), 1, 600001)).toBeUndefined();
    });

    check("ten mailboxes per vault per rolling hour", (db) => {
      for (let i = 0; i < 10; i++) {
        const box = db.openMailbox(b(1), b(2), i);
        if (box) db.closeMailbox(b(1), box.number);
      }

      expect(db.openMailbox(b(1), b(2), 100)).toBeUndefined();
      expect(db.openMailbox(b(1), b(2), 3600000)?.number).toBe(1);
    });

    check("pair commit closes mailbox; approver lasts 24h", (db) => {
      db.openMailbox(b(1), b(2), 0);
      const update = { ...swap(1), closeMailbox: 1, approver: { device: b(3), bytes: b(9) } };
      db.commitSwap(b(1), undefined, update, 1);
      expect(db.mailbox(b(1), 1, 2)).toBeUndefined();
      expect(db.approver(b(1), b(3), 86400000)).toEqual(b(9));
      expect(db.approver(b(1), b(3), 86400001)).toBeUndefined();
    });

    check("blob hashes, vault isolation and conflicts", (db) => {
      db.putBlob(b(1), b(2), b(3));
      expect(db.getBlob(b(1), b(2))).toEqual(b(3));
      expect(db.getBlob(b(2), b(2))).toBeUndefined();
      expect(() => db.putBlob(b(1), b(2), b(4))).toThrow();
      expect(() => db.putBlob(b(1), b(5), b(4), () => b(6))).toThrow("hash mismatch");
      expect(db.blobHashes(b(1))).toEqual([b(2)]);
    });

    check("history retains versions and repair material", (db) => {
      for (let i = 1; i <= 6; i++) {
        db.putBlob(b(1), b(100 + i), b(i));
        const update = swap(i);

        update.files = {
          hash: b(50 + i),
          bytes: b(i),
          retainForever: i === 4,
          versions: [
            {
              fileId: b(1),
              version: BigInt(i),
              tombstone: i === 2,
              blobHash: i === 2 ? undefined : b(100 + i),
            },
          ],
        };

        db.commitSwap(b(1), i === 1 ? undefined : b(i - 1), update, i);
      }

      expect(db.prune(b(1), { maxAge: 1, minVersions: 1 }, 7)).toEqual({
        lists: 2,
        blobs: 2,
      });

      expect(db.fileList(b(1), b(51))).toBeUndefined();
      for (const i of [2, 3, 4, 6]) expect(db.fileList(b(1), b(50 + i))).toBeDefined();
      expect(db.headers(b(1), 1n, 6n)).toHaveLength(6);
    });
  });
}
