import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { readConfig, setConfig } from "./config.ts";

export async function setCheckoutPlacement(
  adapters: TAdapters,
  path: string,
  mode: string | undefined,
) {
  if (mode !== "link" && mode !== "copy")
    throw new EnvdenError("INVALID_INPUT", "Expected placement <checkout> link|copy");

  const checkout = await adapters.repo.checkoutAt(path);
  if (!checkout) throw new EnvdenError("NOT_FOUND", "Checkout not found");

  return withStateLock(adapters.home, async () => {
    const config = await readConfig(adapters.home);

    return setConfig(
      "placement",
      JSON.stringify({ ...config.placement, [checkout.root]: mode }),
      adapters.home,
    );
  });
}
