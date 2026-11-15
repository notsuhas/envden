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
export class Context {
  readonly normalizer = new Normalizer();
  readonly observations: Record<string, string> = {};
  readonly devices = new Map<string, IDevice>();
  readonly servers = new Map<string, TServer>();
  private readonly terminals = new Set<Terminal>();
  private counter = 0;
  private readonly outputs: { prefix: string; output: IOutput }[] = [];

  readonly root: string;
  readonly binary: string;
  readonly serverBinary: string;
  readonly bindings: Map<string, string>;

  constructor(root: string, binary: string, serverBinary: string, bindings: Map<string, string>) {
    this.root = root;
    this.binary = binary;
    this.serverBinary = serverBinary;
    this.bindings = bindings;
    this.normalizer.path(root, "root");
    if (root.startsWith("/var/")) this.normalizer.path(`/private${root}`, "root");
    this.normalizer.path(binary, "binary");
    if (!binary.startsWith("/private/")) this.normalizer.path(`/private${binary}`, "binary");
    this.normalizer.path(serverBinary, "binary");
    for (const bound of bindings.values()) {
      this.normalizer.path(bound, "binary");
      this.normalizer.path(`/private${bound}`, "binary");
    }
  }

  static async create(binary: string, serverBinary: string, bindings: Map<string, string>) {
    return new Context(
      await mkdtemp(join(tmpdir(), "envden-parity-")),
      binary,
      serverBinary,
      bindings,
    );
  }

  async device(name: string, contents?: string): Promise<IDevice> {
    const home = join(this.root, name, "home");
    const checkout = join(home, "app");
    await mkdir(checkout, { recursive: true });
    const temporary = join(this.root, name, "tmp");
    await mkdir(temporary, { recursive: true });
    const env = {
      PATH: process.env.PATH ?? "",
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      ENVDEN_HOME: join(this.root, name, "envden"),
      TMPDIR: temporary,
      TMP: temporary,
      TEMP: temporary,
      ENVDEN_NO_UPDATE_CHECK: "1",
      ENVDEN_TELEMETRY: "0",
      ENVDEN_NO_REPORT: "1",
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
      TZ: "UTC",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Parity",
      GIT_AUTHOR_EMAIL: "parity@example.com",
      GIT_COMMITTER_NAME: "Parity",
      GIT_COMMITTER_EMAIL: "parity@example.com",
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
    };
    const device = { home, checkout, env, binary: this.bindings.get(name) ?? this.binary };
    this.devices.set(name, device);
    this.normalizer.path(home, `home-${name}`);
    this.normalizer.path(await realpath(home), `home-${name}`);
    this.normalizer.path(env.ENVDEN_HOME, `envden-${name}`);
    if (env.ENVDEN_HOME.startsWith("/var/"))
      this.normalizer.path(`/private${env.ENVDEN_HOME}`, `envden-${name}`);
    await this.git(name, ["init", "--quiet", "--initial-branch=main"]);
    await this.git(name, ["remote", "add", "origin", "https://example.com/envden/parity.git"]);
    await writeFile(join(checkout, ".gitignore"), ".env*\n");
    await this.git(name, ["add", ".gitignore"]);
    await this.git(name, ["commit", "-qm", "initial"]);
    if (contents !== undefined) {
      this.normalizer.literal(contents);
      await writeFile(join(checkout, ".env"), contents);
    }

    return device;
  }

  get(name: string): IDevice {
    const device = this.devices.get(name);
    if (!device) throw new Error(`Unknown device ${name}`);

    return device;
  }

  async git(device: string, args: string[]): Promise<void> {
    const d = this.get(device);
    const output = await command({ binary: "git", args, cwd: d.checkout, env: d.env });
    if (output.code !== 0) throw new Error(output.stderr);
  }

  record(label: string, output: IOutput): void {
    const prefix = `${String(++this.counter).padStart(3, "0")} ${label}`;
    this.outputs.push({ prefix, output });
  }

  async cli(device: string, args: string[], code = 0): Promise<IOutput> {
    const d = this.get(device);
    if (args[0] === "doctor" && process.platform !== "darwin") {
      const skipped = {
        stdout: "SKIP doctor --json: host process isolation is only configured on macOS\n",
        stderr: "",
        code: 0,
      };
      this.record(`${device} doctor`, skipped);
      console.log(skipped.stdout.trim());
      return skipped;
    }
    const result = await command({ binary: d.binary, args, cwd: d.checkout, env: d.env });
    this.record(`${device} ${args[0]}`, result);
    if (result.code !== code)
      throw new Error(
        `Expected exit ${code}, got ${result.code}: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
      );

    return result;
  }

  terminal(device: string, args: string[]): Terminal {
    const d = this.get(device);
    const terminal = new Terminal({ binary: d.binary, args, env: d.env, cwd: d.checkout });
    this.terminals.add(terminal);

    return terminal;
  }

  async finish(device: string, args: string[], terminal: Terminal, code = 0): Promise<void> {
    const result = await terminal.finish();
    this.terminals.delete(terminal);
    this.record(`${device} PTY ${args[0]}`, result);
    if (result.code !== code)
      throw new Error(`Expected PTY exit ${code}, got ${result.code}\n${result.stdout}`);
  }

  async pty(device: string, args: string[], answers: IAnswer[], code = 0): Promise<void> {
    const terminal = this.terminal(device, args);
    await terminal.answers(answers);
    await this.finish(device, args, terminal, code);
  }

  async serve(name = "main", restored = false, port = "0"): Promise<TServer> {
    const host = this.devices.has("host") ? this.get("host") : await this.device("host");
    const s = await server(
      this.serverBinary,
      join(this.root, `server-${name}`),
      host.env,
      restored,
      port,
    );
    this.servers.set(name, s);

    return s;
  }

  async stop(name: string): Promise<void> {
    const s = this.servers.get(name);
    if (!s) return;
    this.record(`server ${name}`, await s.stop());
    this.servers.delete(name);
  }

  async collect(): Promise<Record<string, string>> {
    for (const terminal of this.terminals) terminal.stop();
    for (const name of this.servers.keys()) await this.stop(name);

    await prepare(
      this.devices.values(),
      this.normalizer,
      this.outputs.map(({ output }) => output),
    );
    for (const { prefix, output } of this.outputs) {
      this.observations[`${prefix}/stdout`] = this.normalizer.text(output.stdout);
      this.observations[`${prefix}/stderr`] = this.normalizer.text(output.stderr);
      this.observations[`${prefix}/exit`] = String(output.code);
    }
    return { ...this.observations, ...(await snapshot(this.root, this.normalizer)) };
  }

  async cleanup(keep: boolean): Promise<void> {
    if (!keep) await rm(this.root, { recursive: true, force: true });
  }
}
