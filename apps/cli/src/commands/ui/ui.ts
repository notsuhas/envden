import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { openBrowser } from "../../ui/browser.ts";
import { runDashboard } from "../../ui/start.ts";

export const uiCommand = new Command("ui")
  .description("Open a local dashboard for this device")
  .option("--port <port>", "Port on 127.0.0.1 (default: random)", Number)
  .option("--no-open", "Print the link without opening a browser")
  .action(async (options) => {
    await runDashboard(createAdapters(undefined, Date.now), {
      interactive: !!process.stdin.isTTY,
      ...(options.port === undefined ? {} : { port: options.port }),
      now: Date.now,
      report: (line) => console.log(line),
      ...(options.open ? { open: openBrowser } : {}),
      stopped: interrupted(),
    });
  });

function interrupted() {
  return new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}
