import type { INetworkStatus } from "@envden/core/adapters";

export function parseStatus(stdout: string): INetworkStatus {
  const data: unknown = JSON.parse(stdout);

  if (
    !data ||
    typeof data !== "object" ||
    !("BackendState" in data) ||
    typeof data.BackendState !== "string"
  )
    throw new Error("Invalid Tailscale status");

  const running = data.BackendState === "Running";
  const loggedIn = !["NeedsLogin", "NoState"].includes(data.BackendState);
  const self = "Self" in data ? data.Self : undefined;

  const dns =
    self && typeof self === "object" && "DNSName" in self && typeof self.DNSName === "string"
      ? self.DNSName.replace(/\.$/, "")
      : undefined;

  const httpsEnabled =
    "CertDomains" in data &&
    Array.isArray(data.CertDomains) &&
    data.CertDomains.some((name: unknown) => typeof name === "string" && name === dns);

  return {
    ready: running && loggedIn && httpsEnabled,
    running,
    loggedIn,
    httpsEnabled,
    hostname: dns,
    ...(!running
      ? { problem: "Tailscale is not running" }
      : !httpsEnabled
        ? { problem: "Enable HTTPS certificates on the tailnet" }
        : {}),
  };
}
