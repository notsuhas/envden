import { replacementKitOutput } from "./output.ts";
import type { TAdapters } from "../../adapters.ts";
import { confirmedPassword } from "../../onboarding/password.ts";
import { secret } from "../../output/questions.ts";
import { rotateVault } from "../../admin/devices/rotate.ts";
import { replaceKit, changePassword } from "../../admin/recovery/credentials.ts";
import { resetPassword } from "../../admin/recovery/reset.ts";

export async function runVaultAdmin(
  adapters: TAdapters,
  action: "rotate" | "replace" | "change" | "reset",
  now: () => number,
  prompt: typeof secret = secret,
  kitOut?: string,
) {
  if (action === "replace") {
    const output = replacementKitOutput(kitOut);

    const result = await replaceKit(
      adapters,
      await prompt("Master password"),
      now,
      output.show,
    ).catch(output.fail);

    console.log(
      result.kind === "finished"
        ? "Finished an interrupted kit replacement; the kit it showed is now active. Run again for another kit."
        : "Recovery kit replaced; the old kit no longer works",
    );

    return;
  }

  await actions[action](adapters, now, prompt);
}

const actions = {
  rotate: async (adapters: TAdapters, now: () => number, prompt: typeof secret) => {
    await rotateVault(adapters, await prompt("Master password"), now);
    console.log("Vault re-keyed; removed devices can't read new changes");
  },
  change: async (adapters: TAdapters, now: () => number, prompt: typeof secret) => {
    await changePassword(
      adapters,
      await prompt("Old master password"),
      await confirmedPassword(prompt),
      await prompt("Recovery secret key"),
      now,
    );

    console.log("Password changed; the kit stays valid");
  },
  reset: async (adapters: TAdapters, now: () => number, prompt: typeof secret) => {
    await resetPassword(
      adapters,
      await confirmedPassword(prompt),
      await prompt("Recovery secret key"),
      now,
    );

    console.log("Password reset; the kit stays valid");
  },
};
