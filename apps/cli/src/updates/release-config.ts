import type { IReleaseTrust } from "@envden/core/protocol";

// TODO: maintainer must publish the signed feed and pin its release keys before shipping.
export const releaseConfig: {
  url: string;
  trust: IReleaseTrust | undefined;
  buildUrl?: ((version: string, platform: string) => string) | undefined;
} = {
  url: "https://github.com/notsuhas/envden/releases/latest/download/release.bin",
  trust: undefined,
};
