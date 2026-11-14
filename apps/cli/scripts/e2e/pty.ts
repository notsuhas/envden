import { E2E_TIMEOUT, failure } from "./failure.ts";

// oxlint-disable-next-line no-control-regex -- Terminal output carries ANSI escapes that must be stripped before matching prompts.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]|\x1b[=>]/g;

function toPattern(text: string | RegExp): RegExp {
  return typeof text === "string" ? new RegExp(RegExp.escape(text)) : text;
}

interface IStep {
  expect: string;
  send?: string;
}

export interface IPtyOptions {
  label: string;
  binary: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

export class PtySession {
  private raw = "";
  private cursor = 0;
  private readonly decoder = new TextDecoder();
  private readonly child: Bun.Subprocess;
  private readonly label: string;
  private wake = () => {};
  readonly exited: Promise<number>;

  constructor(options: IPtyOptions) {
    this.label = options.label;

    // oxlint-disable-next-line envden/trusted-process -- E2E drives the build artifact inside the checkout through a terminal.
    this.child = Bun.spawn([options.binary, ...options.args], {
      env: options.env,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      terminal: {
        cols: 200,
        rows: 50,
        data: (_terminal, data) => {
          this.raw += this.decoder.decode(data, { stream: true });
          this.wake();
        },
      },
    });

    this.exited = this.child.exited.then((code) => {
      this.wake();

      return code;
    });
  }

  output(): string {
    return this.raw.replace(ANSI, "");
  }

  async expect(
    text: string | RegExp,
    deadline: AbortSignal = AbortSignal.timeout(E2E_TIMEOUT),
  ): Promise<string> {
    const pattern = toPattern(text);
    let found = this.find(pattern);

    while (found === undefined) {
      if (this.child.exitCode !== null || deadline.aborted)
        throw failure(`${this.label}: expected ${pattern}`, this.output());

      await this.idle(deadline);
      found = this.find(pattern);
    }

    return found;
  }

  private find(pattern: RegExp): string | undefined {
    const found = pattern.exec(this.output().slice(this.cursor));
    if (!found) return undefined;
    this.cursor += found.index + found[0].length;

    return found[1] ?? found[0];
  }

  private idle(deadline: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        deadline.removeEventListener("abort", abort);
        this.wake = () => {};
      };

      const abort = () => {
        cleanup();
        reject(failure(`${this.label}: terminal deadline expired`, this.output()));
      };

      this.wake = () => {
        cleanup();
        resolve();
      };

      deadline.addEventListener("abort", abort, { once: true });
      if (deadline.aborted) abort();
    });
  }

  send(keys: string): void {
    this.child.terminal?.write(keys);
  }

  async steps(steps: IStep[]): Promise<void> {
    for (const step of steps) {
      await this.expect(step.expect);
      if (step.send !== undefined) this.send(step.send);
    }
  }

  async succeeds(): Promise<void> {
    const code = await this.exited;
    this.child.terminal?.close();

    if (code !== 0) throw failure(`${this.label}: exited ${code}`, this.output());
  }
}
