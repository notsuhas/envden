export function deriveConsent(
  value: string | undefined,
  yes: boolean | undefined,
  fallback: boolean,
) {
  if (value) return { kind: "selected", value: value === "on" } as const;
  if (yes) return { kind: "selected", value: fallback } as const;

  return { kind: "ask" } as const;
}

export function deriveShell(shell: string) {
  if (shell === "zsh" || shell === "bash" || shell === "fish" || shell === "powershell")
    return { kind: "install", shell } as const;

  return { kind: "skip" } as const;
}

export function deriveAgent(agent: string | undefined, yes: boolean | undefined) {
  if (agent === "on") return { kind: "install" } as const;
  if (!agent && !yes) return { kind: "ask" } as const;

  return { kind: "skip" } as const;
}
