import { heldBackFiles } from "../../sync/local/lineage/held-back.ts";
import { sanitizeTerminal, terminalJson } from "../../output/sanitize.ts";
import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { commandNotice } from "../../notice/command.ts";
import { localStatus } from "../../status/local.ts";

export const statusCommand = new Command("status")
  .option("--json", "Machine-readable status")
  .addOption(new Option("--refresh-cache").hideHelp())
  .action(async (options) => {
    const commandTime = Date.now();

    const adapters = createAdapters(undefined, Date.now);

    const notice = await commandNotice(
      adapters,
      commandTime,
      fetch,
      !!options.refreshCache,
      process.cwd(),
      !options.refreshCache,
    );

    const heldBack = await heldBackFiles(adapters);
    const status = { ...notice, ...(await localStatus(adapters)), heldBack };

    if (!options.refreshCache)
      console.log(
        options.json
          ? terminalJson(status)
          : status.configured
            ? [
                `envden: server ${status.server}`,
                ...heldBack.map((item) => `envden: held back ${item.path}: ${item.reason}`),
                ...status.links
                  .filter(
                    (link) => link.status === "detached" || ("conflict" in link && link.conflict),
                  )
                  .map(
                    (link) =>
                      `envden: ${link.root}/${link.path} ${"conflict" in link && link.conflict ? "conflict" : "detached"}`,
                  ),
                ...(status.update.message ? [status.update.message] : []),
                ...notice.repos.map((repo) => `envden: ${repo} out of sync`),
              ]
                .map(sanitizeTerminal)
                .join("\n")
            : [
                "envden: not configured",
                ...(status.update.message ? [status.update.message] : []),
              ].join("\n"),
      );
  });
