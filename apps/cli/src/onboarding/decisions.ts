export const TOGGLES = ["on", "off"] as const;

export const SHELLS = ["zsh", "bash", "fish", "powershell"] as const;

export type TShell = (typeof SHELLS)[number];

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
  const match = SHELLS.find((item) => item === shell);
  if (match) return { kind: "install", shell: match } as const;

  return { kind: "skip" } as const;
}

export function deriveAgent(agent: string | undefined, yes: boolean | undefined) {
  if (agent === "on") return { kind: "install" } as const;
  if (!agent && !yes) return { kind: "ask" } as const;

  return { kind: "skip" } as const;
}
