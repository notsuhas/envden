import { networkContract } from "@envden/testing/network";
import { createTailscaleNetworkAdapter } from "../index.ts";
import running from "./running.json";

const states: Record<string, unknown> = {
  "not-running": { ...running, BackendState: "Stopped" },
  "logged-out": { BackendState: "NeedsLogin" },
  "https-disabled": { ...running, CertDomains: [] },
};

networkContract("Tailscale", (scenario) =>
  createTailscaleNetworkAdapter(async (args) => {
    if (scenario === "not-installed") throw new Error("Command unavailable");

    if (args[0] === "serve" && args[1] === "status") {
      const taken = { TCP: { "443": { TCPForward: "127.0.0.1:22" } } };

      return {
        exitCode: 0,
        stdout: scenario === "address-taken" ? JSON.stringify(taken) : "{}",
        stderr: "",
      };
    }

    if (args[0] === "serve")
      return { exitCode: scenario === "publish-failed" ? 1 : 0, stdout: "", stderr: "" };

    if (scenario === "unreadable") return { exitCode: 0, stdout: "bad json", stderr: "" };

    return { exitCode: 0, stdout: JSON.stringify(states[scenario] ?? running), stderr: "" };
  }),
);
