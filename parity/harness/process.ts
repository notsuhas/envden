import { terminalScreen } from "./terminal/screen.ts";
import { stripVTControlCharacters } from "node:util";
import type { IResult } from "./types.ts";

export async function execute(
  command: string[],
  env: Record<string, string>,
  cwd: string,
  input = "",
): Promise<Omit<IResult, "label">> {
  const child = Bun.spawn(command, {
    env,
    cwd,
    stdin: new Response(input),
    stdout: "pipe",
    stderr: "pipe",
  });

  const deadline = setTimeout(() => child.kill(), 60000);

  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return { stdout, stderr, code };
  } finally {
    clearTimeout(deadline);
  }
}

export class Terminal {
  private raw = "";
  private cursor = 0;
  private wake = () => {};
  private child: Bun.Subprocess;
  private decoder = new TextDecoder();
  private timer: ReturnType<typeof setTimeout>;

  constructor(command: string[], env: Record<string, string>, cwd: string) {
    this.child = Bun.spawn(command, {
      env,
      cwd,
      terminal: {
        cols: 200,
        rows: 50,
        data: (_terminal, bytes) => {
          this.raw += this.decoder.decode(bytes, { stream: true });
          if (process.env.PARITY_DEBUG) process.stderr.write(bytes);
          this.wake();
        },
      },
    });

    void this.child.exited.then(() => this.wake());

    this.timer = setTimeout(() => {
      this.child.kill("SIGKILL");
      this.wake();
    }, 60000);
  }

  output() {
    return stripVTControlCharacters(this.raw).replaceAll("\r", "");
  }

  async expect(pattern: string | RegExp, send?: string): Promise<string> {
    const regex = typeof pattern === "string" ? new RegExp(RegExp.escape(pattern)) : pattern;

    for (;;) {
      const match = regex.exec(this.output().slice(this.cursor));

      if (match) {
        this.cursor += match.index + match[0].length;
        if (send !== undefined) this.send(send);

        return match[1] ?? match[0];
      }

      await this.idle(pattern);
    }
  }

  private async idle(pattern: string | RegExp) {
    if (this.child.exitCode !== null || this.child.killed)
      throw new Error(`Terminal expected ${pattern}: ${this.output()}`);

    await new Promise<void>((resolve) => {
      this.wake = resolve;
    });
  }

  send(keys: string) {
    this.child.terminal?.write(keys);
  }

  async finish(): Promise<Omit<IResult, "label">> {
    try {
      const code = await this.child.exited;

      return { stdout: terminalScreen(this.raw), stderr: "", code };
    } finally {
      this.close();
    }
  }

  close() {
    clearTimeout(this.timer);
    if (this.child.exitCode === null) this.child.kill();
    this.child.terminal?.close();
  }
}
