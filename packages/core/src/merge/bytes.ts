export function equal(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;

  return Buffer.from(a).equals(b);
}
