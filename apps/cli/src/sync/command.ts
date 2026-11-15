import { PromptCancelled } from "../state/cancelled.ts";
import { select, isCancel } from "@clack/prompts";
import { sanitizeTerminal } from "../output/sanitize.ts";
import type { ISyncOptions } from "./model.ts";
import { login } from "../session/login.ts";
import { consent, secret } from "../output/prompts/questions.ts";

export function syncOptions(
  options: {
    all?: boolean;
    yes?: boolean;
    json?: boolean;
  },
  now: () => number,
): ISyncOptions {
  return {
    ...options,
    cwd: process.cwd(),
    now,
    fetcher: fetch,
    interactive: !!process.stdin.isTTY,
    confirm: (keys) => consent(`Merge changes to ${keys.join(", ")}?`),
    unlock: async (client, vaultId) => {
      await login(client, vaultId, (retry) =>
        secret(retry ? "Wrong master password. Try again" : "Master password"),
      );
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

      if (isCancel(choice)) throw new PromptCancelled();

      return choice;
    },
    report: (message) => {
      if (!options.json) console.log(sanitizeTerminal(message));
    },
  };
}
