import { select, isCancel } from "@clack/prompts";
import { EnvdenError } from "@envden/core/errors";
import { sanitizeTerminal } from "../output/sanitize.ts";
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
    choose: async (path) => {
      const choice = await select({
        message: `Detached file: ${sanitizeTerminal(path)}`,
        options: [
          { value: "keep-mine" as const, label: "Keep mine" },
          { value: "take-server" as const, label: "Take server" },
          { value: "merge" as const, label: "Merge" },
        ],
      });

      if (isCancel(choice)) throw new EnvdenError("INVALID_INPUT", "Cancelled");

      return choice;
    },
    report: (message) => console.log(sanitizeTerminal(message)),
  };
}
