import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { aliasUnlinkedRepo } from "../../sync/alias.ts";

export const aliasCommand = new Command("alias")
  .argument("<repo>")
  .argument("<target>")
  .action(async (repo, target) => {
    await aliasUnlinkedRepo(createAdapters(), repo, target);
    console.log("Alias saved");
  });
