import { requireValue } from "../encoding/binary.ts";

export function isSemver(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
}

export function parseSemver(version: string): readonly [bigint, bigint, bigint] {
  requireValue(isSemver(version), "Invalid version");
  const [x, y, z] = version.split(".");

  return [BigInt(x!), BigInt(y!), BigInt(z!)];
}

export function compareSemver(a: string, b: string): number {
  const aa = parseSemver(a),
    bb = parseSemver(b);

  for (let i = 0; i < 3; i++) {
    if (aa[i]! < bb[i]!) return -1;
    if (aa[i]! > bb[i]!) return 1;
  }

  return 0;
}

// The protocol in docs/PROTOCOL.md; ServerHello lists it and clients refuse servers that don't.
export const PROTOCOL_VERSION = 2;
