import { setTimeout as delay } from "node:timers/promises";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { choose } from "../../output/prompts/questions.ts";
import { chooseSendFile } from "../../share/send/candidates.ts";
import { sendProgress } from "../../share/send/progress.ts";
import { sendFile } from "../../share/send/run.ts";
import { shareMinutes } from "../../share/send/ttl.ts";
import { loadState } from "../../state/store/repository.ts";

export const sendCommand = new Command("send")
  .argument("[file]", "File to send (default: this checkout's synced env file)")
  .description("Send a file once through a temporary public link that needs no envden to open")
  .option("--ttl <minutes>", "Minutes the link stays open (1-60)", "10")
  .action(async (file, options) => {
    const adapters = createAdapters(undefined, Date.now);
    const minutes = shareMinutes(options.ttl);
    const interactive = !!process.stdin.isTTY;

    const path = await chooseSendFile(
      await loadState(adapters.home),
      { ...(file === undefined ? {} : { file }), cwd: process.cwd(), interactive },
      choose,
    );

    await sendFile(adapters, {
      path,
      minutes,
      now: Date.now,
      wait: (ms, signal) => delay(ms, undefined, { signal }),
      stopped: interrupted(),
      progress: sendProgress(),
    });
  });

function interrupted() {
  return new Promise((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, resolve);
  });
}
