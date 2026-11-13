import type { TContext } from "../db/context.ts";

export function createCredentials(context: TContext) {
  const { bytes, run } = context;

  function setupToken(): Uint8Array | undefined {
    return bytes("SELECT bytes FROM setup WHERE singleton=1");
  }

  function setSetupToken(hash: Uint8Array): void {
    run("INSERT OR REPLACE INTO setup VALUES(1,?)", hash);
  }

  return { setupToken, setSetupToken };
}
