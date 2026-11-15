import { spawnTrusted } from "@envden/core/process";
import { EnvdenError } from "@envden/core/errors";
import { parseStatus } from "./status/parse.ts";
import { tailscaleProblem } from "./status/problem.ts";
import { serveConflict } from "./serve/conflict.ts";
import type {
  INetworkAdapter,
  INetworkProblem,
  INetworkStatus,
  THttpsCheck,
} from "@envden/core/adapters";

interface ICommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type TRunner = (args: string[]) => Promise<ICommandResult>;

const STDERR_LIMIT = 500;

async function run(args: string[]): Promise<ICommandResult> {
  const child = spawnTrusted("tailscale", args, { stdout: "pipe", stderr: "pipe" });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { stdout, stderr, exitCode };
}

function unavailable(kind: INetworkProblem["kind"]): INetworkStatus {
  return {
    ready: false,
    running: false,
    loggedIn: false,
    httpsEnabled: false,
    problem: tailscaleProblem(kind),
  };
}

// Tailscale's own output holds the next step, such as the link to enable Serve.
function failure(summary: string, stderr: string, cause?: unknown) {
  const detail = stderr.trim().slice(0, STDERR_LIMIT);

  return new EnvdenError("INTERNAL", detail ? `${summary}: ${detail}` : summary, { cause });
}

class TailscaleAdapter implements INetworkAdapter {
  readonly id = "tailscale";

  private readonly runner: TRunner;

  constructor(runner: TRunner = run) {
    this.runner = runner;
  }

  async status(): Promise<INetworkStatus> {
    const result = await this.runner(["status", "--json"]).catch(() => undefined);
    if (!result) return unavailable("not-installed");

    if (result.exitCode !== 0) return unavailable("not-running");

    try {
      return parseStatus(result.stdout);
    } catch {
      return unavailable("unreadable");
    }
  }

  async checkHttpsCertificate(): Promise<THttpsCheck> {
    return (await this.status()).problem ?? { kind: "ready" };
  }

  private async command(args: string[], summary: string) {
    const result = await this.runner(args).catch((cause: unknown) => {
      throw failure(summary, "", cause);
    });

    if (result.exitCode !== 0) throw failure(summary, result.stderr);

    return result.stdout;
  }

  async expose(port: number): Promise<string> {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new EnvdenError("INVALID_INPUT", "Invalid port");

    const status = await this.status();

    if (status.problem || !status.hostname)
      throw new EnvdenError("CONFLICT", status.problem?.message ?? "Tailscale is not ready");

    const target = `http://127.0.0.1:${port}`;

    const current = await this.command(
      ["serve", "status", "--json"],
      "Tailscale serve status failed",
    );

    if (serveConflict(current, status.hostname, target))
      throw new EnvdenError(
        "CONFLICT",
        "Tailscale already serves something else on port 443. See it with tailscale serve status, and remove it with tailscale serve --https=443 off",
      );

    await this.command(["serve", "--bg", "--https=443", target], "Tailscale serve failed");

    return `https://${status.hostname}`;
  }
}

export function createTailscaleNetworkAdapter(runner?: TRunner): INetworkAdapter {
  return new TailscaleAdapter(runner);
}
