import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { secret } from "../../output/questions.ts";
import { unlockDevice } from "../../session/unlock.ts";

export const unlockCommand = new Command("unlock")
  .description("Log in with your master password to restart the unlock period")
  .action(async () => {
    await unlockDevice(
      createAdapters(undefined, Date.now),
      (retry) => secret(retry ? "Wrong master password. Try again" : "Master password"),
      Date.now,
      fetch,
    );

    console.log("Unlocked");
  });
