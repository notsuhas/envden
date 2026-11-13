import { confirm, password, text, select } from "@clack/prompts";
import { sanitizeTerminal } from "./sanitize.ts";
import { EnvdenError } from "@envden/core/errors";

function answer<T extends string | boolean>(value: T | symbol): T {
  if (typeof value === "symbol") throw new EnvdenError("INVALID_INPUT", "Cancelled");

  return value;
}

function terminal(): void {
  if (!process.stdin.isTTY)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Run secret entry and checkout approval in your own terminal",
    );
}

export async function secret(message: string): Promise<string> {
  terminal();

  return answer<string>(
    await password({
      message: sanitizeTerminal(message),
      validate: (value) => (value ? undefined : "Required"),
    }),
  );
}

export async function input(message: string, required = true): Promise<string> {
  terminal();

  return answer<string>(
    await text({
      message: sanitizeTerminal(message),
      validate: (value) => (!required || value ? undefined : "Required"),
    }),
  );
}

export async function consent(message: string): Promise<boolean> {
  terminal();

  return answer<boolean>(
    await confirm({ message: sanitizeTerminal(message), initialValue: false }),
  );
}

export async function shellChoice(): Promise<"zsh" | "bash" | "fish" | "powershell" | "none"> {
  terminal();

  return answer<"zsh" | "bash" | "fish" | "powershell" | "none">(
    await select({
      message: "Install the shell notice?",
      options: [
        { value: "zsh" as const, label: "zsh" },
        { value: "bash" as const, label: "bash" },
        { value: "fish" as const, label: "fish" },
        { value: "powershell" as const, label: "PowerShell" },
        { value: "none" as const, label: "None" },
      ],
    }),
  );
}
