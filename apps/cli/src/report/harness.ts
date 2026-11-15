type THarnessId = "claude" | "codex" | "gemini";

interface IHarness {
  id: THarnessId;
  name: string;
  path: string;
}

const HARNESSES: { id: THarnessId; name: string; promptArgs: (prompt: string) => string[] }[] = [
  { id: "claude", name: "Claude Code", promptArgs: (prompt) => [prompt] },
  { id: "codex", name: "Codex", promptArgs: (prompt) => [prompt] },
  { id: "gemini", name: "Gemini CLI", promptArgs: (prompt) => ["-i", prompt] },
];

export function detectHarnesses(which: (command: string) => string | null): IHarness[] {
  return HARNESSES.flatMap((harness) => {
    const path = which(harness.id);

    return path ? [{ id: harness.id, name: harness.name, path }] : [];
  });
}

export function launchCommand(harness: IHarness, prompt: string): string[] {
  const promptArgs = HARNESSES.find((entry) => entry.id === harness.id)!.promptArgs;

  return [harness.path, ...promptArgs(prompt)];
}
