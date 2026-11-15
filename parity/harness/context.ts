import { start } from "./server/start.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execute, Terminal } from "./process.ts";
import type { IDevice, IResult } from "./types.ts";

export class Context {
  readonly results: IResult[] = [];
  readonly devices = new Map<string, IDevice>();

  readonly servers: {
    role: string;
    data: string;
    url: string;
    token: string;
    stop: () => Promise<void>;
  }[] = [];

  private terminals: Terminal[] = [];

  readonly root: string;
  readonly commands: Record<string, string[]>;

  constructor(root: string, commands: Record<string, string[]>) {
    this.root = root;
    this.commands = commands;
  }

  async device(role: string, content?: string) {
    const home = join(this.root, role, "home");
    const checkout = join(home, "app");
    const bin = join(this.root, "bin");
    await mkdir(checkout, { recursive: true });
    await mkdir(bin, { recursive: true });

    await writeFile(
      join(bin, "tailscale"),
      `#!/bin/sh
if [ "$1" = status ]; then
  echo '{"BackendState":"Running","Self":{"DNSName":"parity.test.ts.net."},"CertDomains":["parity.test.ts.net"]}'
else
  exit 1
fi
`,
      { mode: 0o755 },
    );

    const env = {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      ENVDEN_HOME: join(this.root, role, "envden"),
      ENVDEN_NO_UPDATE_CHECK: "1",
      ENVDEN_TELEMETRY: "0",
      ENVDEN_NO_REPORT: "1",
      DO_NOT_TRACK: "1",
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
      TMPDIR: this.root,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Parity",
      GIT_AUTHOR_EMAIL: "parity@example.com",
      GIT_COMMITTER_NAME: "Parity",
      GIT_COMMITTER_EMAIL: "parity@example.com",
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
    };

    const device = { home, checkout, env };
    this.devices.set(role, device);
    await this.git(role, ["init", "--quiet", "--initial-branch=main"]);
    await this.git(role, ["remote", "add", "origin", "https://example.com/envden/parity.git"]);
    await writeFile(join(checkout, ".gitignore"), ".env\n.env.*\n");
    if (content !== undefined) await writeFile(join(checkout, ".env"), content);

    return device;
  }

  get(role: string) {
    const device = this.devices.get(role);
    if (!device) throw new Error(`Unknown role ${role}`);

    return device;
  }

  async git(role: string, args: string[]) {
    const d = this.get(role);
    const result = await execute(["git", ...args], d.env, d.checkout);
    if (result.code !== 0) throw new Error(result.stderr);
  }

  async run(role: string, args: string[], expected = 0, input = "") {
    const d = this.get(role);
    const result = await execute([...this.commands[role]!, ...args], d.env, d.checkout, input);
    this.record(`${role} ${args.join(" ")}`, result, expected);

    return result;
  }

  pty(role: string, args: string[]): Terminal {
    const d = this.get(role);
    const terminal = new Terminal([...this.commands[role]!, ...args], d.env, d.checkout);
    this.terminals.push(terminal);

    return terminal;
  }

  async finish(role: string, label: string, terminal: Terminal, expected = 0) {
    this.record(`${role} ${label}`, await terminal.finish(), expected);
  }

  record(label: string, result: Omit<IResult, "label">, expected: number) {
    this.results.push({ label, ...result });

    if (result.code !== expected)
      throw new Error(
        `${label}: expected exit ${expected}, got ${result.code}\n${result.stdout}\n${result.stderr}`,
      );
  }

  async server(role = "server", restored = false, existingData?: string, port = "0") {
    if (!this.devices.has(role)) await this.device(role);
    const d = this.get(role);
    const data = existingData ?? join(this.root, role, "data");
    const args = ["serve", "--data-dir", data, "--port", port, ...(restored ? ["--restored"] : [])];

    const record = { label: `${role} serve`, stdout: "", stderr: "", code: 0 };

    const server = {
      role,
      data,
      ...(await start([...this.commands[role]!, ...args], d.env, d.home, record)),
    };

    this.servers.push(server);
    this.results.push(record);

    return server;
  }

  async close() {
    for (const terminal of this.terminals) terminal.close();
    for (const server of this.servers) await server.stop();
  }
}
