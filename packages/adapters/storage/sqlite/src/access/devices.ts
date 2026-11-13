import type { IStoredDevice } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";

export function createDevices(context: TContext) {
  const { db, run } = context;

  function device(vault: Uint8Array, device: Uint8Array): IStoredDevice | undefined {
    const row = db
      .query<
        { unlocked: number; fresh: number; version: string; grant: Uint8Array | null },
        [Uint8Array, Uint8Array]
      >("SELECT * FROM devices WHERE vault=? AND id=?")
      .get(vault, device);

    return row
      ? {
          unlockedUntil: row.unlocked,
          freshUntil: row.fresh,
          clientVersion: row.version,
          ...(row.grant ? { mailboxGrant: row.grant } : {}),
        }
      : undefined;
  }

  function putDevice(vault: Uint8Array, device: Uint8Array, state: IStoredDevice): void {
    run(
      "INSERT OR REPLACE INTO devices VALUES(?,?,?,?,?,?)",
      vault,
      device,
      state.unlockedUntil,
      state.freshUntil,
      state.clientVersion,
      state.mailboxGrant ?? null,
    );
  }

  return { device, putDevice };
}
