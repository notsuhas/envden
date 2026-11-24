import type { IStoredDevice } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";

export function createDevices(context: TContext) {
  const { db, run } = context;

  function device(vault: Uint8Array, device: Uint8Array): IStoredDevice | undefined {
    const row = db
      .query<{ version: string }, [Uint8Array, Uint8Array]>(
        "SELECT version FROM devices WHERE vault=? AND id=?",
      )
      .get(vault, device);

    return row ? { clientVersion: row.version } : undefined;
  }

  function putDevice(vault: Uint8Array, device: Uint8Array, state: IStoredDevice): void {
    run("INSERT OR REPLACE INTO devices VALUES(?,?,?)", vault, device, state.clientVersion);
  }

  return { device, putDevice };
}
