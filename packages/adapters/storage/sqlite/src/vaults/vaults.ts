import type { IStorageAdapter, IStoredVault, IStateWrite } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";
import { equal } from "../db/values.ts";

interface IVaultRow {
  active: number;
  frozen: number;
  moved: Uint8Array | null;
  refused: number;
  period: number | null;
  repair: Uint8Array | null;
  restored: Uint8Array | null;
  progress: Uint8Array | null;
}

export function createVaults(
  context: TContext,
  storage: Pick<IStorageAdapter, "setupToken" | "writeState">,
) {
  const { db, bytes, run } = context;

  function hasVault(vault: Uint8Array): boolean {
    return readVault(vault) !== undefined;
  }

  function readVault(vault: Uint8Array): IStoredVault | undefined {
    const row = db.query<IVaultRow, [Uint8Array]>("SELECT * FROM vaults WHERE id=?").get(vault);
    if (!row) return undefined;

    return {
      active: !!row.active,
      frozen: !!row.frozen,
      skRefused: !!row.refused,
      unlockPeriod: row.period,
      ...(row.moved ? { serverMoved: row.moved } : {}),
      ...(row.repair && row.restored
        ? {
            restored: {
              repairTokenHash: row.repair,
              restoredHead: row.restored,
              ...(row.progress ? { finishProgress: row.progress } : {}),
            },
          }
        : {}),
    };
  }

  function putVault(vault: Uint8Array, state: IStoredVault): void {
    run(
      `INSERT INTO vaults(id,active,frozen,moved,refused,period,repair,restored,progress) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,frozen=excluded.frozen,moved=excluded.moved,refused=excluded.refused,period=excluded.period,repair=excluded.repair,restored=excluded.restored,progress=excluded.progress`,
      vault,
      +state.active,
      +state.frozen,
      state.serverMoved ?? null,
      +state.skRefused,
      state.unlockPeriod,
      state.restored?.repairTokenHash ?? null,
      state.restored?.restoredHead ?? null,
      state.restored?.finishProgress ?? null,
    );
  }

  function configureVault(
    vault: Uint8Array,
    state: IStoredVault,
    writes: IStateWrite[] = [],
    setupTokenHash?: Uint8Array,
  ): void {
    db.transaction(() => {
      if (setupTokenHash && (hasVault(vault) || !equal(storage.setupToken(), setupTokenHash)))
        throw new Error("Setup token changed, consumed, or vault exists");

      putVault(vault, state);
      storage.writeState(vault, writes);
      if (setupTokenHash) run("DELETE FROM setup");
    }).immediate();
  }

  function head(vault: Uint8Array): Uint8Array | undefined {
    return bytes("SELECT head AS bytes FROM vaults WHERE id=? AND head IS NOT NULL", vault);
  }

  function discardInactiveVault(vault: Uint8Array): void {
    db.transaction(() => {
      if (readVault(vault)?.active) throw new Error("Cannot discard an active vault");

      for (const table of [
        "headers",
        "entries",
        "lists",
        "state",
        "devices",
        "digests",
        "blobs",
        "sessions",
        "approvers",
        "mailboxes",
        "openings",
      ])
        run(`DELETE FROM ${table} WHERE vault=?`, vault);

      run("DELETE FROM vaults WHERE id=?", vault);
    }).immediate();
  }

  return { hasVault, vault: readVault, configureVault, head, discardInactiveVault };
}
