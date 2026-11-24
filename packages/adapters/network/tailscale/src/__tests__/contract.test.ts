import { networkContract } from "@envden/testing/network";
import { createTailscaleNetworkAdapter } from "../index.ts";
import { FUNNEL_UP, funnelChild } from "./funnel-child.ts";
import running from "./running.json";

const states: Record<string, unknown> = {
  "not-running": { ...running, BackendState: "Stopped" },
  "logged-out": { BackendState: "NeedsLogin" },
  "https-disabled": { ...running, CertDomains: [] },
  "share-denied": { ...running, Self: { ...running.Self, CapMap: { https: null } } },
};

const taken = {
  TCP: { "8080": { TCPForward: "127.0.0.1:22" } },
  Web: { "laptop.tail.example:10000": { Handlers: { "/": { Proxy: "http://127.0.0.1:3000" } } } },
};

networkContract("Tailscale", (scenario) =>
  createTailscaleNetworkAdapter(
    async (args) => {
      if (scenario === "not-installed") throw new Error("Command unavailable");

      if (args[0] === "serve" && args[1] === "status")
        return {
          exitCode: 0,
          stdout: scenario === "address-taken" ? JSON.stringify(taken) : "{}",
          stderr: "",
        };

      if (args[0] === "serve")
        return { exitCode: scenario === "publish-failed" ? 1 : 0, stdout: "", stderr: "" };

      if (scenario === "unreadable") return { exitCode: 0, stdout: "bad json", stderr: "" };

      return { exitCode: 0, stdout: JSON.stringify(states[scenario] ?? running), stderr: "" };
    },
    {
      spawn: () =>
        scenario === "share-failed"
          ? funnelChild("", { stderr: "error: something went wrong" })
          : funnelChild(FUNNEL_UP),
      lookup: async () => "found",
    },
  ),
);
