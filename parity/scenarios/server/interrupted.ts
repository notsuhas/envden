import type { TContext } from "../../runtime/context.ts";
import { cli } from "../steps/cli.ts";
import { answerPassword, joinKit, setup } from "../steps/onboarding.ts";
import { faultable, switchTo } from "../steps/server.ts";
import type { IScenario, IStep } from "../types.ts";

type TProxy = ReturnType<typeof faultable>;

interface IInterrupt {
  destination: string;
  fault: "source" | "destination";
  path: string;
  after: "abort" | "resume";
  status?: number;
}

const proxies = new WeakMap<TContext, Map<string, TProxy>>();

function guard(c: TContext, name: string, path: string, status?: number): void {
  const map = proxies.get(c) ?? new Map<string, TProxy>();

  proxies.set(c, map.set(name, faultable(c.servers.get(name)!, path, status)));
}

function proxy(c: TContext, name: string): TProxy {
  const found = proxies.get(c)?.get(name);
  if (!found) throw new Error(`No fault proxy for ${name}`);

  return found;
}

async function move(c: TContext, args: string[], code = 0): Promise<void> {
  await c.pty("a", ["server", "move", ...args], answerPassword, code);
}

function interrupt(options: IInterrupt): IStep {
  return {
    name: `fault ${options.path} at the ${options.fault}, then ${options.after}`,
    run: async (c) => {
      const s = await c.serve(options.destination);

      guard(c, options.destination, options.path, options.status);

      const faulty = proxy(c, options.fault === "source" ? "main" : options.destination);

      faulty.arm();
      await move(c, [s.url, "--setup-token", s.token], 1);
      if (!faulty.hits()) throw new Error(`Fault at ${options.path} was not reached`);
      if (options.after === "resume") await move(c, ["--abort"], 1);
      faulty.disarm();
      await move(c, [`--${options.after}`]);
    },
  };
}

export const interrupted: IScenario = {
  name: "server-move-interrupted",
  roles: ["server", "server:first", "server:chain", "server:destination", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup({ front: (c) => guard(c, "main", "/v1/swap") }),
    joinKit(),
    interrupt({ destination: "first", fault: "source", path: "/v1/swap", after: "abort" }),
    cli("a", ["status", "--json"]),
    interrupt({
      destination: "chain",
      fault: "destination",
      path: "/v1/move/chain",
      after: "abort",
      status: 401,
    }),
    cli("a", ["device", "ls", "--json"]),
    interrupt({
      destination: "destination",
      fault: "destination",
      path: "/v1/swap",
      after: "resume",
    }),
    {
      name: "switch after the source goes offline",
      run: async (c) => {
        const url = c.servers.get("destination")!.url;

        await c.stop("main");
        await switchTo(c, "b", url);
        await c.cli("a", ["server", "switch", url]);
      },
    },
    cli("a", ["status", "--json"]),
  ],
};
