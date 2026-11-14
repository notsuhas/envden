export function statSymbol(
  available: readonly string[],
  platform: NodeJS.Platform,
  arch: string,
): { name: string; version?: number } | undefined {
  const name = platform === "darwin" && arch === "x64" ? "fstatat$INODE64" : "fstatat";
  if (available.includes(name)) return { name };
  if (platform !== "linux" || !available.includes("__fxstatat")) return undefined;
  if (arch === "x64") return { name: "__fxstatat", version: 1 };
  if (arch === "arm64") return { name: "__fxstatat", version: 0 };

  return undefined;
}
