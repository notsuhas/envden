import type { TOutputMode } from "../compare/output.ts";
import { commandNames, outputMode, observeOutput } from "./context/observations.ts";
import { environment } from "./device/environment.ts";
import { prepare } from "./prepare.ts";
import { realpath, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Normalizer } from "../normalize/normalizer.ts";
import { command, Terminal, type IAnswer, type IOutput } from "./process.ts";
import { server, type TServer } from "./server.ts";
import { snapshot } from "./snapshot.ts";

export interface IDevice {
  home: string;
  checkout: string;
  env: Record<string, string>;
  binary: string;
}

export async function createContext(
  binary: string,
  serverBinary: string,
  bindings: Map<string, string>,
) {
  const root = await mkdtemp(join(tmpdir(), "envden-parity-"));
  const normalizer = new Normalizer();
  const observations: Record<string, string> = {};
  const devices = new Map<string, IDevice>();
  const servers = new Map<string, TServer>();
  const terminals = new Set<Terminal>();
  let counter = 0;
  const names: string[] = [];
  const outputs: { prefix: string; output: IOutput; mode: TOutputMode }[] = [];
  normalizer.path(root, "root");
  if (root.startsWith("/var/")) normalizer.path(`/private${root}`, "root");
  normalizer.path(binary, "binary");
  if (!binary.startsWith("/private/")) normalizer.path(`/private${binary}`, "binary");
  normalizer.path(serverBinary, "binary");

  for (const bound of bindings.values()) {
    normalizer.path(bound, "binary");
    normalizer.path(`/private${bound}`, "binary");
  }

  async function device(name: string, contents?: string): Promise<IDevice> {
    const home = join(root, name, "home");
    const checkout = join(home, "app");
    await mkdir(checkout, { recursive: true });
    const temporary = join(root, name, "tmp");
    await mkdir(temporary, { recursive: true });

    const env = environment(root, name, home, temporary);

    const device = { home, checkout, env, binary: bindings.get(name) ?? binary };
    devices.set(name, device);
    normalizer.path(home, `home-${name}`);
    normalizer.path(await realpath(home), `home-${name}`);
    normalizer.path(env.ENVDEN_HOME, `envden-${name}`);

    if (env.ENVDEN_HOME.startsWith("/var/"))
      normalizer.path(`/private${env.ENVDEN_HOME}`, `envden-${name}`);

    await git(name, ["init", "--quiet", "--initial-branch=main"]);
    await git(name, ["remote", "add", "origin", "https://example.com/envden/parity.git"]);
    await writeFile(join(checkout, ".gitignore"), ".env*\n");
    await git(name, ["add", ".gitignore"]);
    await git(name, ["commit", "-qm", "initial"]);

    if (contents !== undefined) {
      normalizer.literal(contents);
      await writeFile(join(checkout, ".env"), contents);
    }

    return device;
  }

  function get(name: string): IDevice {
    const device = devices.get(name);
    if (!device) throw new Error(`Unknown device ${name}`);

    return device;
  }

  async function git(device: string, args: string[]): Promise<void> {
    const d = get(device);
    const output = await command({ binary: "git", args, cwd: d.checkout, env: d.env });
    if (output.code !== 0) throw new Error(output.stderr);
  }

  function record(label: string, output: IOutput, mode: TOutputMode = "semantic"): void {
    const prefix = `${String(++counter).padStart(3, "0")} ${label}`;
    outputs.push({ prefix, output, mode });
  }

  const cli = async (device: string, args: string[], code = 0): Promise<IOutput> => {
    const d = get(device);
    names.push(...commandNames(args));

    if (args[0] === "doctor" && process.platform !== "darwin") {
      const skipped = {
        stdout: "SKIP doctor --json: host process isolation is only configured on macOS\n",
        stderr: "",
        code: 0,
      };

      record(`${device} doctor`, skipped);
      console.log(skipped.stdout.trim());

      return skipped;
    }

    const result = await command({ binary: d.binary, args, cwd: d.checkout, env: d.env });

    record(`${device} ${args[0]}`, result, outputMode(args));

    if (result.code !== code)
      throw new Error(
        `Expected exit ${code}, got ${result.code}: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
      );

    return result;
  };

  function terminal(device: string, args: string[]): Terminal {
    const d = get(device);
    const terminal = new Terminal({ binary: d.binary, args, env: d.env, cwd: d.checkout });
    terminals.add(terminal);

    return terminal;
  }

  async function finish(
    device: string,
    args: string[],
    terminal: Terminal,
    code = 0,
  ): Promise<void> {
    const result = await terminal.finish();
    terminals.delete(terminal);
    record(`${device} PTY ${args[0]}`, result, "pty");

    if (result.code !== code)
      throw new Error(`Expected PTY exit ${code}, got ${result.code}\n${result.stdout}`);
  }

  const pty = async (
    device: string,
    args: string[],
    answers: IAnswer[],
    code = 0,
  ): Promise<void> => {
    const session: Terminal = terminal(device, args);
    await session.answers(answers);
    await finish(device, args, session, code);
  };

  const serve = async (name = "main", restored = false, port = "0"): Promise<TServer> => {
    const host = devices.has("host") ? get("host") : await device("host");

    const s = await server(serverBinary, join(root, `server-${name}`), host.env, restored, port);

    servers.set(name, s);

    return s;
  };

  async function stop(name: string): Promise<void> {
    const s = servers.get(name);
    if (!s) return;
    record(`server ${name}`, await s.stop());
    servers.delete(name);
  }

  async function collect(): Promise<Record<string, string>> {
    for (const terminal of terminals) terminal.stop();
    for (const name of servers.keys()) await stop(name);

    const stateNames = await prepare(
      devices.values(),
      normalizer,
      outputs.map(({ output }) => output),
    );

    names.push(...stateNames);

    for (const { prefix, output, mode } of outputs)
      Object.assign(observations, observeOutput(prefix, output, mode, normalizer, names));

    return { ...observations, ...(await snapshot(root, normalizer)) };
  }

  const cleanup = async (keep: boolean): Promise<void> => {
    if (!keep) await rm(root, { recursive: true, force: true });
  };

  return {
    root,
    normalizer,
    servers,
    device,
    get,
    git,
    cli,
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
