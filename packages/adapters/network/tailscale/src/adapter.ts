import { spawnTrusted } from "@envden/core/process";
import { EnvdenError } from "@envden/core/errors";
import { parseStatus } from "./status/parse.ts";
import type { INetworkAdapter, INetworkStatus } from "@envden/core/adapters";

interface ICommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type TRunner = (args: string[]) => Promise<ICommandResult>;

async function run(args: string[]): Promise<ICommandResult> {
  const child = spawnTrusted("tailscale", args, { stdout: "pipe", stderr: "pipe" });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { stdout, stderr, exitCode };
}

class TailscaleAdapter implements INetworkAdapter {
  readonly id = "tailscale";

  private readonly runner: TRunner;

  constructor(runner: TRunner = run) {
    this.runner = runner;
  }

  async status(): Promise<INetworkStatus> {
    try {
      const result = await this.runner(["status", "--json"]);
      if (result.exitCode !== 0) throw new EnvdenError("INVALID_INPUT", "Tailscale status failed");

      return parseStatus(result.stdout);
    } catch {
      return {
        ready: false,
        running: false,
        loggedIn: false,
        httpsEnabled: false,
        problem: "Tailscale unavailable or invalid status",
      };
    }
  }

  async checkHttpsCertificate(): Promise<boolean> {
    return (await this.status()).httpsEnabled;
  }

  async expose(port: number): Promise<string> {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new EnvdenError("INVALID_INPUT", "Invalid port");

    const status = await this.status();

    if (!status.ready || !status.hostname)
      throw new EnvdenError("CONFLICT", "Tailscale is not ready");

    const result = await this.runner([
      "serve",
      "--bg",
      "--https=443",
      `http://127.0.0.1:${port}`,
    ]).catch((cause: unknown) => {
      throw new EnvdenError("INTERNAL", "Tailscale serve failed", { cause });
    });

    if (result.exitCode !== 0) throw new EnvdenError("INTERNAL", "Tailscale serve failed");

    return `https://${status.hostname}`;
  }
}

export function createTailscaleNetworkAdapter(runner?: TRunner): INetworkAdapter {
  return new TailscaleAdapter(runner);
}
