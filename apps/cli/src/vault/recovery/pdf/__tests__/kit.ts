import * as p from "@envden/core/protocol";

export const kit = {
  vaultId: p.base32(new Uint8Array(32).fill(7)),
  secretKey: p.encodeSecretKey(new Uint8Array(16).fill(9)),
  server: "https://envden.example.ts.net",
};
