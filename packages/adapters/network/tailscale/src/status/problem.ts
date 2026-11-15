import type { INetworkProblem } from "@envden/core/adapters";

const messages: Record<INetworkProblem["kind"], string> = {
  "not-installed": "Tailscale isn't installed. Get it from https://tailscale.com/download",
  "not-running": "Tailscale isn't running. Start it, then try again",
  "logged-out": "Log in to Tailscale with tailscale up, then try again",
  "https-disabled":
    "Enable HTTPS certificates in the Tailscale admin console: https://login.tailscale.com/admin/dns",
  unreadable: "Tailscale's status couldn't be read. Run tailscale status to check it",
};

export function tailscaleProblem(kind: INetworkProblem["kind"]): INetworkProblem {
  return { kind, message: messages[kind] };
}

export function statusProblem(state: {
  running: boolean;
  loggedIn: boolean;
  httpsEnabled: boolean;
}): INetworkProblem | undefined {
  if (!state.loggedIn) return tailscaleProblem("logged-out");

  if (!state.running) return tailscaleProblem("not-running");

  if (!state.httpsEnabled) return tailscaleProblem("https-disabled");

  return undefined;
}
