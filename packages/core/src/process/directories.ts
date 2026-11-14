export function fixedDirectories(platform = process.platform): string[] {
  if (platform === "win32")
    return [
      "C:\\Windows\\System32",
      "C:\\Windows\\System32\\OpenSSH",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
      "C:\\Program Files\\PowerShell\\7",
      "C:\\Program Files\\Git\\cmd",
      "C:\\Program Files\\Tailscale",
    ];

  const system = ["/usr/bin", "/bin", "/usr/sbin", "/sbin", "/usr/local/bin"];

  return platform === "darwin"
    ? [...system, "/opt/homebrew/bin", "/Applications/Tailscale.app/Contents/MacOS"]
    : [...system, "/home/linuxbrew/.linuxbrew/bin", "/snap/bin"];
}

export function managerRoots(platform = process.platform, arch = process.arch): string[] {
  if (platform === "darwin") return arch === "arm64" ? ["/opt/homebrew"] : ["/usr/local/Homebrew"];

  return platform === "linux" ? ["/home/linuxbrew/.linuxbrew"] : [];
}
