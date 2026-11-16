export type TTailscaleBinary = "stand-in" | "real";

export interface ITailscaleCandidate {
  path: string;
  binary?: TTailscaleBinary;
}

export interface IIsolationInput {
  platform: NodeJS.Platform;
  sandbox: boolean;
  candidates: ITailscaleCandidate[];
}

export type TTailscale = "stand-in" | "absent" | "blocked" | "unsafe";

export interface IIsolation {
  tailscale: TTailscale;
  deny?: string[];
}

export type TTailscaleNeed = "isolated" | "stand-in";

// B18: no harness-launched process may execute a real tailscale.
export function deriveIsolation(input: IIsolationInput): IIsolation {
  const first = input.candidates.find((candidate) => candidate.binary);
  const real = input.candidates.some((candidate) => candidate.binary === "real");

  if (input.platform === "darwin" && input.sandbox) {
    const deny = input.candidates
      .filter((candidate) => candidate.binary !== "stand-in")
      .map((candidate) => candidate.path);

    return { tailscale: sandboxed(first?.binary), deny };
  }

  if (real) return { tailscale: "unsafe" };

  return { tailscale: first ? "stand-in" : "absent" };
}

function sandboxed(binary: TTailscaleBinary | undefined): TTailscale {
  if (!binary) return "absent";

  return binary === "stand-in" ? "stand-in" : "blocked";
}

export function skipReason(isolation: IIsolation, need: TTailscaleNeed): string | undefined {
  if (isolation.tailscale === "unsafe")
    return "a real tailscale is at a trusted path and no sandbox can block it";

  if (need === "stand-in" && isolation.tailscale !== "stand-in")
    return "needs the CI stand-in tailscale at a trusted path (parity/ci/install-stand-ins.sh)";

  return undefined;
}
