import { input } from "./questions.ts";

export function defaultInput(value: string | undefined, prompt: string) {
  return value ?? input(prompt);
}
