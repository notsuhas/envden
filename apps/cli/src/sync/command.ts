import type { ISyncOptions } from "./model.ts";
import { login } from "../session/login.ts";
import { consent, secret } from "../output/questions.ts";

export function syncOptions(options: { all?: boolean; yes?: boolean }): ISyncOptions {
  return {
    ...options,
    cwd: process.cwd(),
    now: Date.now,
    fetcher: fetch,
    interactive: !!process.stdin.isTTY,
    confirm: (keys) => consent(`Merge changes to ${keys.join(", ")}?`),
    unlock: async (client, vaultId) => {
      await login(client, vaultId, await secret("Master password for the moved server"));
    },
    report: (message) => console.log(message),
  };
}
