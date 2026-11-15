import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { aliasUnlinkedRepo } from "../../sync/alias.ts";

export const aliasCommand = new Command("alias")
  .description("Share another repo's env files, for example from a fork")
  .argument("<repo>", "Repo ID to alias")
  .argument("<target>", "Repo ID whose env files it uses")
  .action(async (repo, target) => {
    await aliasUnlinkedRepo(createAdapters(undefined, Date.now), repo, target);

    console.log("Alias saved");
  });
