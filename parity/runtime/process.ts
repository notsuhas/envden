import { stripVTControlCharacters } from "node:util";
import { terminalText } from "../normalize/terminal.ts";

export interface IOutput {
  stdout: string;
  stderr: string;
  code: number;
}
interface IProcess {
  binary: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
}
export interface IAnswer {
  expect: string | RegExp;
  send: string;
}

export async function command(options: IProcess): Promise<IOutput> {
  const argv =
    options.args[0] === "doctor" && process.platform === "darwin"
      ? [
          "/usr/bin/sandbox-exec",
          "-p",
          '(version 1)(allow default)(deny process-exec (regex "[Tt]ailscale"))',
          options.binary,
          ...options.args,
        ]
      : [options.binary, ...options.args];
  const child = Bun.spawn(argv, {
    env: options.env,
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return { stdout, stderr, code };
  } finally {
    clearTimeout(timer);
  }
}

export class Terminal {
  private raw = "";
  private cursor = 0;
  private wake = () => {};
  private readonly decoder = new TextDecoder();
  private readonly child: Bun.Subprocess;

  constructor(options: IProcess) {
    this.child = Bun.spawn([options.binary, ...options.args], {
      env: options.env,
      cwd: options.cwd,
      terminal: {
        cols: 200,
        rows: 50,
        data: (_, bytes) => {
          this.raw += this.decoder.decode(bytes, { stream: true });
          this.wake();
        },
      },
    });
    void this.child.exited.then(() => this.wake());
  }

  async expect(pattern: string | RegExp): Promise<string> {
    const re = typeof pattern === "string" ? new RegExp(RegExp.escape(pattern)) : pattern;
    const signal = AbortSignal.timeout(30000);
    while (true) {
      const plain = stripVTControlCharacters(this.raw);
      const match = re.exec(plain.slice(this.cursor));
      if (match) {
        this.cursor += match.index + match[0].length;
        return match[1] ?? match[0];
      }
      if (this.child.exitCode !== null || signal.aborted)
        throw new Error(`Expected ${re}\n${terminalText(this.raw)}`);
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          this.wake = () => {};
          reject(new Error(`PTY deadline: ${re}\n${terminalText(this.raw)}`));
        };
        this.wake = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }

  async answers(answers: IAnswer[]): Promise<void> {
    for (const answer of answers) {
      await this.expect(answer.expect);
      this.child.terminal?.write(answer.send);
    }
  }

  async finish(): Promise<IOutput> {
    const timer = setTimeout(() => this.child.kill("SIGKILL"), 30000);
    try {
      const code = await this.child.exited;
      return { stdout: terminalText(this.raw), stderr: "", code };
    } finally {
      clearTimeout(timer);
      this.child.terminal?.close();
    }
  }

  stop(): void {
    this.child.kill("SIGKILL");
    this.child.terminal?.close();
  }
}
