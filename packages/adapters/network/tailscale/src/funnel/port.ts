import { portTaken } from "../serve/taken.ts";
import { funnelAccess } from "./access.ts";

// Funnel only allows these ports; the least used goes first.
const FUNNEL_PORTS = [10000, 8443, 443] as const;

type TPortChoice =
  | { kind: "free"; port: number }
  | { kind: "denied"; access: "no-funnel" | "port-denied" }
  | { kind: "taken"; ports: number[] };

export function funnelPort(stdout: string, serve: string): TPortChoice {
  const allowed = FUNNEL_PORTS.filter((port) => funnelAccess(stdout, port) === "allowed");

  if (allowed.length === 0) {
    const access = funnelAccess(stdout, FUNNEL_PORTS[0]);

    return { kind: "denied", access: access === "no-funnel" ? access : "port-denied" };
  }

  const port = allowed.find((candidate) => !portTaken(serve, candidate));

  return port === undefined ? { kind: "taken", ports: allowed } : { kind: "free", port };
}
