export function lineEnding(...files: Uint8Array[]): string {
  for (const file of files) {
    const index = file.indexOf(10);
    if (index !== -1) return file[index - 1] === 13 ? "\r\n" : "\n";
  }

  return "\n";
}

export function withLineEnding(raw: Uint8Array, ending: string): Uint8Array {
  return Buffer.from(Buffer.from(raw).toString("latin1").replace(/\r?\n/g, ending), "latin1");
}
