import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TOutputMode } from "../compare/output.ts";
import { isolate } from "../isolation/probe.ts";
import { skipReason, type IIsolation } from "../isolation/tailscale.ts";
import { Normalizer } from "../normalize/normalizer.ts";
import { commandNames, outputMode, observeOutput } from "./context/observations.ts";
import { deviceStore } from "./context/devices.ts";
import { prepare } from "./prepare.ts";
import { command } from "./process/command.ts";
import { Terminal } from "./process/terminal.ts";
import type { IAnswer, IOutput } from "./process/types.ts";
import { server, type TServer } from "./server/start.ts";
import { snapshot } from "./snapshot.ts";

export interface IBindings {
  binary: (role: string) => string;
  binaries: string[];
  isolation: IIsolation;
}

function serverRole(name: string): string {
  return name === "main" ? "server" : `server:${name}`;
}

export async function createContext(bindings: IBindings) {
  const root = await mkdtemp(join(tmpdir(), "envden-parity-"));
  const normalizer = new Normalizer();
  const store = deviceStore(root, normalizer, bindings.binary);
  const { devices, get } = store;
  const servers = new Map<string, TServer>();
  const ports = new Map<string, string>();
  const terminals = new Set<Terminal>();
  const names: string[] = [];
  const outputs: { prefix: string; output: IOutput; mode: TOutputMode }[] = [];
  const argv = (binary: string, args: string[]) => isolate([binary, ...args], bindings.isolation);

  let counter = 0;

  normalizer.path(root, "root");
  if (root.startsWith("/var/")) normalizer.path(`/private${root}`, "root");

  for (const binary of bindings.binaries) {
    normalizer.path(binary, "binary");
    if (!binary.startsWith("/private/")) normalizer.path(`/private${binary}`, "binary");
  }

  function observe(label: string, output: IOutput, mode: TOutputMode = "semantic"): void {
    outputs.push({ prefix: `${String(++counter).padStart(3, "0")} ${label}`, output, mode });
  }

  function expectCode(label: string, result: IOutput, code: number): void {
    if (result.code !== code)
      throw new Error(
        `${label}: expected exit ${code}, got ${result.code}\n${result.stdout}\n${result.stderr}`,
      );
  }

  const cli = async (device: string, args: string[], code = 0, input?: string) => {
    const d = get(device);
    const skip = args[0] === "doctor" ? skipReason(bindings.isolation, "isolated") : undefined;

    names.push(...commandNames(args));

    if (skip) {
      const skipped = { stdout: `SKIP doctor: ${skip}\n`, stderr: "", code: 0 };

      observe(`${device} doctor`, skipped);

      return skipped;
    }

    const result = await command({
      argv: argv(d.binary, args),
      cwd: d.checkout,
      env: d.env,
      input,
    });

    observe(`${device} ${args[0]}`, result, outputMode(args));
    expectCode(args.join(" "), result, code);

    return result;
  };

  function terminal(device: string, args: string[]): Terminal {
    const d = get(device);
    const session = new Terminal({ argv: argv(d.binary, args), env: d.env, cwd: d.checkout });

    terminals.add(session);

    return session;
  }

  async function finish(device: string, args: string[], session: Terminal, code = 0) {
    const result = await session.finish();

    terminals.delete(session);
    observe(`${device} PTY ${args[0]}`, result, "pty");
    expectCode(`PTY ${args.join(" ")}`, result, code);

    return result;
  }

  const pty = async (device: string, args: string[], answers: IAnswer[], code = 0) => {
    const session = terminal(device, args);

    await session.answers(answers);

    return finish(device, args, session, code);
  };

  // A restarted server keeps its port so saved device addresses stay valid.
  const serve = async (name = "main", restored = false): Promise<TServer> => {
    const host = devices.has("host") ? get("host") : await store.device("host");
    const binary = bindings.binary(serverRole(name));

    const started = await server({
      argv: (args) => argv(binary, args),
      directory: join(root, `server-${name}`),
      env: host.env,
      restored,
      port: ports.get(name) ?? "0",
    });

    servers.set(name, started);
    ports.set(name, new URL(started.url).port);

    return started;
  };

  async function stop(name: string): Promise<void> {
    const s = servers.get(name);
    if (!s) return;

    observe(`server ${name}`, await s.stop());
    servers.delete(name);
  }

  async function shutdown(): Promise<void> {
    for (const session of terminals) session.stop();
    for (const name of servers.keys()) await stop(name);
  }

  async function collect(files = true): Promise<Record<string, string>> {
    await shutdown();

    names.push(
      ...(await prepare(
        devices.values(),
        normalizer,
        outputs.map((o) => o.output),
      )),
    );

    const observations = Object.assign(
      {},
      ...outputs.map(({ prefix, output, mode }) =>
        observeOutput(prefix, output, mode, normalizer, names),
      ),
    ) as Record<string, string>;

    return files ? { ...observations, ...(await snapshot(root, normalizer)) } : observations;
  }

  const cleanup = async (keep: boolean): Promise<void> => {
    if (!keep) await rm(root, { recursive: true, force: true });
  };

  return {
    root,
    normalizer,
    servers,
    isolation: bindings.isolation,
    device: store.device,
    has: (name: string) => devices.has(name),
    get,
    git: store.git,
    cli,
    observe,
    terminal,
    finish,
    pty,
    serve,
    stop,
    collect,
    cleanup,
  };
}

export type TContext = Awaited<ReturnType<typeof createContext>>;
