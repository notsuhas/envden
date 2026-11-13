import { networkContract } from "@envden/testing/network";
import { createTailscaleNetworkAdapter } from "../index.ts";
import running from "./running.json";

networkContract("Tailscale", (scenario) =>
  createTailscaleNetworkAdapter(async (args) => {
    if (scenario === "unavailable") throw new Error("Command unavailable");

    if (args[0] === "serve")
      return { exitCode: scenario === "publish-failed" ? 1 : 0, stdout: "", stderr: "" };

    const data =
      scenario === "logged-out"
        ? { BackendState: "NeedsLogin" }
        : scenario === "https-disabled"
          ? { ...running, CertDomains: [] }
          : running;

    return { exitCode: 0, stdout: JSON.stringify(data), stderr: "" };
  }),
);
