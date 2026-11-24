export const targets = [
  "darwin-x64",
  "darwin-arm64",
  "linux-x64",
  "linux-arm64",
  "linux-x64-musl",
  "linux-arm64-musl",
];

export function binaryName(platform: string) {
  return `envden-${platform}`;
}

export function assetName(platform: string) {
  return `${binaryName(platform)}.tar.gz`;
}
