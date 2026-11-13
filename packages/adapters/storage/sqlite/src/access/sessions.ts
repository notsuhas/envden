import type { ISessionKey } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";

export function createSessions(context: TContext) {
  const { bytes, run } = context;

  function putSession(vault: Uint8Array, key: ISessionKey, bytes: Uint8Array, now: number): void {
    run(
      "INSERT OR REPLACE INTO sessions VALUES(?,?,?,?,?,?)",
      vault,
      key.kind,
      key.device,
      key.purpose,
      bytes,
      now + (key.kind === "login" ? 120000 : 600000),
    );
  }

  function session(vault: Uint8Array, key: ISessionKey, now: number): Uint8Array | undefined {
    return bytes(
      "SELECT bytes FROM sessions WHERE vault=? AND kind=? AND device=? AND purpose=? AND expires>?",
      vault,
      key.kind,
      key.device,
      key.purpose,
      now,
    );
  }

  function consumeSession(
    vault: Uint8Array,
    key: ISessionKey,
    now: number,
  ): Uint8Array | undefined {
    return bytes(
      "DELETE FROM sessions WHERE vault=? AND kind=? AND device=? AND purpose=? AND expires>? RETURNING bytes",
      vault,
      key.kind,
      key.device,
      key.purpose,
      now,
    );
  }

  return { putSession, session, consumeSession };
}
