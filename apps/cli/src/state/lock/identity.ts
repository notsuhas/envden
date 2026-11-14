export function machineIdentity(encoded: string): { host: string; boot: string } | undefined {
  try {
    const value: unknown = JSON.parse(encoded);

    if (
      value &&
      typeof value === "object" &&
      "host" in value &&
      "boot" in value &&
      typeof value.host === "string" &&
      typeof value.boot === "string"
    )
      return { host: value.host, boot: value.boot };
  } catch {
    return undefined;
  }

  return undefined;
}
