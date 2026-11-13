export function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function equal(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  return a === undefined ? b === undefined : b !== undefined && Buffer.from(a).equals(b);
}

export function seq(value: bigint): string {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error("Sequence outside u64");

  return value.toString().padStart(20, "0");
}
