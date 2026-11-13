export const targets = [
  "darwin-x64",
  "darwin-arm64",
  "linux-x64",
  "linux-arm64",
  "linux-x64-musl",
  "linux-arm64-musl",
  "windows-x64",
  "windows-arm64",
];

export function assetName(platform: string) {
  return `envden-${platform}${platform.startsWith("windows-") ? ".exe" : ""}`;
}
