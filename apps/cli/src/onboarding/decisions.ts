import { EnvdenError } from "@envden/core/errors";

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

const ADDRESS_HINT = "Not a server address. Use one like envden.your-tailnet.ts.net";

// A bare host gets https://, since every envden server is reached over HTTPS.
function serverAddress(text: string) {
  const trimmed = text.trim();
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!URL.canParse(candidate)) return undefined;

  const url = new URL(candidate);

  return ["https:", "http:"].includes(url.protocol) && url.hostname ? url.origin : undefined;
}

export function addressProblem(text: string) {
  return serverAddress(text) ? undefined : ADDRESS_HINT;
}

export function requireServerAddress(text: string) {
  const address = serverAddress(text);
  if (!address) throw new EnvdenError("INVALID_INPUT", ADDRESS_HINT);

  return address;
}
