const units = ["B", "KiB", "MiB", "GiB", "TiB"];

export function formatBytes(bytes: number): string {
  const exponent = Math.min(units.length - 1, Math.floor(Math.log2(Math.max(bytes, 1)) / 10));
  const value = bytes / 1024 ** exponent;

  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;

  return `${minutes}m`;
}
