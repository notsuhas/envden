export function hex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}
