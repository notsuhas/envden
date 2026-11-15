import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { secret } from "../../output/questions.ts";
import { unlockDevice } from "../../session/unlock.ts";

export const unlockCommand = new Command("unlock").action(async () => {
  const commandTime = Date.now();

  await unlockDevice(
    createAdapters(undefined, () => commandTime),
    await secret("Master password"),
    () => commandTime,
    fetch,
  );

  console.log("Unlocked");
});
