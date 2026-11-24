import { spawnTrusted } from "@envden/core/process";
import { EnvdenError } from "@envden/core/errors";
import { parseStatus } from "./status/parse.ts";
import { tailscaleProblem } from "./status/problem.ts";
import { serveConflict } from "./serve/conflict.ts";
import { failure } from "./command/failure.ts";
import { openFunnel, type IFunnelEffects } from "./funnel/open.ts";
import type {
  INetworkAdapter,
  INetworkProblem,
  INetworkStatus,
  IPublicShare,
  THttpsCheck,
} from "@envden/core/adapters";

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

function unavailable(kind: INetworkProblem["kind"]): INetworkStatus {
  return {
    ready: false,
    running: false,
    loggedIn: false,
    httpsEnabled: false,
    problem: tailscaleProblem(kind),
  };
}

class TailscaleAdapter implements INetworkAdapter {
  readonly id = "tailscale";

  private readonly runner: TRunner;

  private readonly funnel: Partial<IFunnelEffects>;

  constructor(runner: TRunner = run, funnel: Partial<IFunnelEffects> = {}) {
    this.runner = runner;
    this.funnel = funnel;
  }

  async status(): Promise<INetworkStatus> {
    return (await this.readStatus()).status;
  }

  private async readStatus() {
    const result = await this.runner(["status", "--json"]).catch(() => undefined);
    if (!result) return { status: unavailable("not-installed"), stdout: "" };

    if (result.exitCode !== 0) return { status: unavailable("not-running"), stdout: "" };

    try {
      return { status: parseStatus(result.stdout), stdout: result.stdout };
    } catch {
      return { status: unavailable("unreadable"), stdout: "" };
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

    if (serveConflict(current, status.hostname, port, target))
      throw new EnvdenError(
        "CONFLICT",
        `Tailscale already serves something else on port ${port}. See it with tailscale serve status, and remove it with tailscale serve --https=${port} off`,
      );

    await this.command(["serve", "--bg", `--https=${port}`, target], "Tailscale serve failed");

    return `https://${status.hostname}:${port}`;
  }

  openPublicShare(port: number, path: string): Promise<IPublicShare> {
    const inputs = {
      status: () => this.readStatus(),
      serveStatus: () =>
        this.command(["serve", "status", "--json"], "Tailscale serve status failed"),
      effects: this.funnel,
    };

    return openFunnel(inputs, port, path);
  }
}

export function createTailscaleNetworkAdapter(
  runner?: TRunner,
  funnel?: Partial<IFunnelEffects>,
): INetworkAdapter {
  return new TailscaleAdapter(runner, funnel);
}
