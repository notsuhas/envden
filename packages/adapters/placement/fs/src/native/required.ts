import { EnvdenError } from "@envden/core/errors";

export function requireNativePlacement(platform: NodeJS.Platform, library: unknown) {
  if (platform !== "win32" && !library)
    throw new EnvdenError("NOT_IMPLEMENTED", "Native placement could not initialise");
}
