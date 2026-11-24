export function fixedDirectories(platform = process.platform): string[] {
  const system = ["/usr/bin", "/bin", "/usr/sbin", "/sbin", "/usr/local/bin"];

  return platform === "darwin"
    ? [...system, "/opt/homebrew/bin", "/Applications/Tailscale.app/Contents/MacOS"]
    : [...system, "/home/linuxbrew/.linuxbrew/bin", "/snap/bin"];
}

export function managerRoots(platform = process.platform, arch = process.arch): string[] {
  if (platform === "darwin") return arch === "arm64" ? ["/opt/homebrew"] : ["/usr/local/Homebrew"];

  return platform === "linux" ? ["/home/linuxbrew/.linuxbrew"] : [];
}
