import type { TAdapters } from "../../adapters.ts";
import { secret } from "../../output/questions.ts";
import { rotateVault } from "../devices/rotate.ts";
import { replaceKit, changePassword } from "./credentials.ts";
import { resetPassword } from "./reset.ts";

export async function runVaultAdmin(
  adapters: TAdapters,
  action: "rotate" | "replace" | "change" | "reset",
  now: () => number,
) {
  await actions[action](adapters, now);
}

const actions = {
  rotate: async (adapters: TAdapters, now: () => number) => {
    await rotateVault(adapters, await secret("Master password"), now);
    console.log("Epoch rotated");
  },
  replace: async (adapters: TAdapters, now: () => number) => {
    console.log(
      JSON.stringify(await replaceKit(adapters, await secret("Master password"), now), null, 2),
    );
  },
  change: async (adapters: TAdapters, now: () => number) => {
    await changePassword(
      adapters,
      await secret("Old master password"),
      await secret("New master password"),
      await secret("Recovery secret key"),
      now,
    );

    console.log("Password changed; the kit stays valid");
  },
  reset: async (adapters: TAdapters, now: () => number) => {
    await resetPassword(
      adapters,
      await secret("New master password"),
      await secret("Recovery secret key"),
      now,
    );

    console.log("Password reset; the kit stays valid");
  },
};
