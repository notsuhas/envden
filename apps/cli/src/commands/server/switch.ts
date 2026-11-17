import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { switchServer } from "../../admin/move/switch.ts";
import { secret } from "../../output/prompts/questions.ts";
import { login } from "../../session/login.ts";

export const serverSwitchCommand = new Command("switch")
  .description("Follow a signed move when the old server is unreachable")
  .argument("<server>", "Destination server address")
  .action(async (server) => {
    const adapters = createAdapters(undefined, Date.now);

    const unlock = process.stdin.isTTY
      ? (client: Parameters<typeof login>[0], vaultId: Uint8Array) =>
          login(client, vaultId, (retry) =>
            secret(retry ? "Wrong master password. Try again" : "Master password"),
          )
      : undefined;

    await switchServer(adapters, server, Date.now, adapters.fetcher, unlock);

    console.log("Server switched");
  });
