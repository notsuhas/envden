import { reportReplacementKit } from "./output.ts";
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
    const kit = await replaceKit(adapters, await prompt("Master password"), now);
    await reportReplacementKit(kit, kitOut);

    return;
  }

  await actions[action](adapters, now, prompt);
}

const actions = {
  rotate: async (adapters: TAdapters, now: () => number, prompt: typeof secret) => {
    await rotateVault(adapters, await prompt("Master password"), now);
    console.log("Epoch rotated");
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
