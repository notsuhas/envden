import type { TContext } from "../db/context.ts";

export function createNonces(context: TContext) {
  const { db, run } = context;

  function rememberNonce(device: Uint8Array, nonce: Uint8Array, now: number): boolean {
    return db
      .transaction(() => {
        run("DELETE FROM nonces WHERE expires<=?", now);

        return run("INSERT OR IGNORE INTO nonces VALUES(?,?,?)", device, nonce, now + 600000) === 1;
      })
      .immediate();
  }

  return { rememberNonce };
}
