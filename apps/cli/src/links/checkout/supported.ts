import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { consent } from "../../output/prompts/questions.ts";
import { checkoutPlacement } from "./mode.ts";

export async function supportedPlacement(
  adapters: TAdapters,
  root: string,
  copy = false,
  ask = consent,
  interactive = !!process.stdin.isTTY,
) {
  const mode = await checkoutPlacement(adapters, root, copy, ask, interactive);
  const placement = adapters.placement(mode, root);
  if (mode === "copy" || (await placement.supported(root))) return placement;

  if (
    interactive &&
    (await ask("Links are unavailable. Use plaintext copy mode for this checkout?"))
  ) {
    await checkoutPlacement(adapters, root, true);

    return adapters.placement("copy", root);
  }

  throw new EnvdenError(
    "INVALID_INPUT",
    "Links unavailable; explicitly select copy mode to continue",
  );
}
