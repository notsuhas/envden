import type { IReleaseTrust } from "@envden/core/protocol";

const REPO = "https://github.com/notsuhas/envden/releases";

function hex(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function buildUrl(version: string, platform: string): string {
  const suffix = platform.startsWith("windows-") ? ".exe" : "";

  return `${REPO}/download/v${version}/envden-${platform}${suffix}`;
}

export const releaseConfig: {
  url: string;
  trust: IReleaseTrust | undefined;
  buildUrl?: ((version: string, platform: string) => string) | undefined;
} = {
  url: `${REPO}/latest/download/release-g1.bin`,
  trust: {
    generation: 1,
    keys: {
      primary: hex("076f10d3f89177426c15ba079888bfd4202494bc39675d62dee80e0159ff91d0"),
      backup: hex("3fe4aa304aa27a4abf8656715e2bbb8783251e3376435791ab36ee83bc7303b0"),
    },
  },
  buildUrl,
};
