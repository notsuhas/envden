import { PromptCancelled } from "../../state/cancelled.ts";
import { confirm, password, text, select, multiselect } from "@clack/prompts";
import { sanitizeTerminal } from "../sanitize.ts";
import { EnvdenError } from "@envden/core/errors";

type TCheck = (value: string) => string | undefined;

function answer<T extends string | boolean>(value: T | symbol): T {
  if (typeof value === "symbol") throw new PromptCancelled();

  return value;
}

function terminal(label: string): void {
  if (!process.stdin.isTTY)
    throw new EnvdenError(
      "INVALID_INPUT",
      `${label.replace(/[?:.]+$/, "")} needs a terminal. Run this command in your own terminal`,
    );
}

export async function secret(message: string, check: TCheck = () => undefined): Promise<string> {
  terminal(message);

  return answer<string>(
    await password({
      message: sanitizeTerminal(message),
      validate: (value) => (value ? check(value) : "Required"),
    }),
  );
}

export async function input(
  message: string,
  required = true,
  initialValue?: string,
  check: TCheck = () => undefined,
): Promise<string> {
  terminal(message);

  return answer<string>(
    await text({
      message: sanitizeTerminal(message),
      ...(initialValue === undefined ? {} : { initialValue }),
      validate: (value) => (value ? check(value) : required ? "Required" : undefined),
    }),
  );
}

export async function consent(message: string, initialValue = false): Promise<boolean> {
  terminal(message);

  return answer<boolean>(await confirm({ message: sanitizeTerminal(message), initialValue }));
}

export async function shellChoice(): Promise<"zsh" | "bash" | "fish" | "powershell" | "none"> {
  const message =
    "Install the shell notice? It prints a line when you cd into a checkout whose env files need a push or pull";

  terminal(message);

  return answer<"zsh" | "bash" | "fish" | "powershell" | "none">(
    await select({
      message,
      options: [
        { value: "zsh" as const, label: "zsh" },
        { value: "bash" as const, label: "bash" },
        { value: "fish" as const, label: "fish" },
        { value: "powershell" as const, label: "PowerShell" },
        { value: "none" as const, label: "No, skip it" },
      ],
    }),
  );
}

export async function chooseResolution(
  path: string,
): Promise<"keep-mine" | "take-server" | "merge"> {
  const message = `${sanitizeTerminal(path)} differs from the server's copy`;
  terminal(message);

  return answer<"keep-mine" | "take-server" | "merge">(
    await select({
      message,
      options: [
        { value: "keep-mine" as const, label: "Keep mine" },
        { value: "take-server" as const, label: "Take the server's" },
        { value: "merge" as const, label: "Merge both" },
      ],
    }),
  );
}

export async function choose(
  message: string,
  options: { value: "separate" | "store"; label: string }[],
): Promise<"separate" | "store"> {
  terminal(message);

  return answer<"separate" | "store">(
    await select({
      message: sanitizeTerminal(message),
      options: options.map((option) => ({ ...option, label: sanitizeTerminal(option.label) })),
    }),
  );
}

export async function chooseMany(
  message: string,
  options: { value: string; label: string }[],
): Promise<string[]> {
  terminal(message);

  const result = await multiselect({
    message: sanitizeTerminal(message),
    required: false,
    initialValues: options.map((option) => option.value),
    options: options.map((option) => ({ ...option, label: sanitizeTerminal(option.label) })),
  });

  if (typeof result === "symbol") throw new PromptCancelled();

  return result;
}
