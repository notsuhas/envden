import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { homePath } from "../../output/home-path.ts";
import { consent } from "../../output/prompts/questions.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import { receiveFile } from "../../share/receive/run.ts";

export const receiveCommand = new Command("receive")
  .argument("<link>", "The link from envden send, in quotes")
  .argument("[file]", "Where to save it", ".env")
  .description("Save a file someone sent with envden send")
  .action(async (link, file) => {
    const adapters = createAdapters(undefined, Date.now);

    const result = await receiveFile(adapters, {
      link,
      out: file,
      cwd: process.cwd(),
      interactive: !!process.stdin.isTTY,
      confirm: consent,
    });

    const path = sanitizeTerminal(homePath(result.path, adapters.userHome));
    console.log(result.kind === "saved" ? `Saved ${path}` : `Kept ${path}; nothing was received`);
  });
