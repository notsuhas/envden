import { stripVTControlCharacters } from "node:util";
import { matchesPrompt } from "../../compare/prompt/match.ts";
import { conversationTurn } from "../../compare/conversation.ts";
import { keywordPattern } from "../../compare/presentation.ts";
import { terminalText } from "../../normalize/terminal.ts";
import type { IAnswer, IOutput, IProcess, ITurn } from "./types.ts";

const DEADLINE = 30000;

export class Terminal {
  private raw = "";
  private readonly conversation: ITurn[] = [];
  private answerCursor = 0;
  private cursor = 0;
  private wake = () => {};
  private readonly decoder = new TextDecoder();
  private readonly child: Bun.Subprocess;

  constructor(options: IProcess) {
    this.child = Bun.spawn(options.argv, {
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

  async expect(pattern: string | RegExp, prompt?: string | RegExp): Promise<string> {
    const re = expression(pattern);
    const signal = AbortSignal.timeout(DEADLINE);
    let match = this.match(re, prompt);

    while (!match) {
      this.alive(re, signal);
      await this.wait(signal, () => `PTY deadline: ${re}\n${terminalText(this.raw)}`);
      match = this.match(re, prompt);
    }

    return match[1] ?? match[0];
  }

  private alive(re: RegExp, signal: AbortSignal): void {
    if (this.child.exitCode !== null || signal.aborted)
      throw new Error(`Expected ${re}\n${terminalText(this.raw)}`);
  }

  private match(re: RegExp, prompt?: string | RegExp): RegExpExecArray | null {
    return prompt === undefined ? this.matchOutput(re) : this.matchPrompt(re, prompt);
  }

  private matchOutput(re: RegExp): RegExpExecArray | null {
    const match = re.exec(stripVTControlCharacters(this.raw).slice(this.cursor));
    if (match) this.cursor += match.index + match[0].length;

    return match;
  }

  // A string prompt must be the newest question on screen; a pattern only has to match.
  private matchPrompt(re: RegExp, prompt: string | RegExp): RegExpExecArray | null {
    const plain = terminalText(this.raw.slice(this.answerCursor));
    const previous = this.conversation.at(-1)?.prompts.at(-1);
    if (typeof prompt === "string" && !matchesPrompt(plain, prompt, previous)) return null;

    return re.exec(plain);
  }

  private wait(signal: AbortSignal, message: () => string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        this.wake = () => {};
        reject(new Error(message()));
      };

      this.wake = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };

      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  async answers(answers: IAnswer[]): Promise<void> {
    for (const answer of answers) {
      await this.expect(expression(answer.expect, true), answer.expect);

      const screen = terminalText(this.raw.slice(this.answerCursor));
      const previousPrompt = this.conversation.at(-1)?.prompts.at(-1);

      const { prompts } = conversationTurn(screen, answer.send, previousPrompt);

      this.conversation.push({ screen, prompts, answer: answer.send });
      this.answerCursor = this.raw.length;
      this.send(answer.send);
    }
  }

  send(keys: string): void {
    this.child.terminal?.write(keys);
  }

  // Sends keys and reports whether the process exits within the grace period.
  async exitsAfter(keys: string, graceMs: number): Promise<boolean> {
    this.send(keys);

    const exited = await Promise.race([
      this.child.exited.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(resolve, graceMs, false)),
    ]);

    this.raw += exited ? "" : "\n[no exit after keys]\n";

    return exited;
  }

  async finish(): Promise<IOutput> {
    const timer = setTimeout(() => this.child.kill("SIGKILL"), DEADLINE);

    try {
      const code = await this.child.exited;

      return { stdout: terminalText(this.raw), stderr: "", code, conversation: this.conversation };
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

function expression(pattern: string | RegExp, prompt = false): RegExp {
  if (typeof pattern !== "string") return pattern;

  return prompt ? keywordPattern(pattern) : new RegExp(RegExp.escape(pattern));
}
