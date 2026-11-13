import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { aliasRepo } from "../../links/alias.ts";

export const aliasCommand = new Command("alias")
  .argument("<repo>")
  .argument("<target>")
  .action(async (repo, target) => {
    await aliasRepo(createAdapters(), repo, target);
    console.log("Alias saved");
  });
