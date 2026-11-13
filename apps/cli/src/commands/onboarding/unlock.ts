import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { secret } from "../../output/questions.ts";
import { unlockDevice } from "../../session/unlock.ts";

export const unlockCommand = new Command("unlock").action(async () => {
  await unlockDevice(createAdapters(), await secret("Master password"), () => Date.now(), fetch);
  console.log("Unlocked");
});
