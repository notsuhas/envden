import { portTaken } from "../serve/taken.ts";
import { funnelAccess } from "./access.ts";

// Funnel only allows these ports; the least used goes first.
const FUNNEL_PORTS = [10000, 8443, 443] as const;

type TAllowedPorts =
  | { kind: "allowed"; ports: number[] }
  | { kind: "denied"; access: "no-funnel" | "port-denied" };

export function allowedFunnelPorts(stdout: string): TAllowedPorts {
  const ports = FUNNEL_PORTS.filter((port) => funnelAccess(stdout, port) === "allowed");
  if (ports.length > 0) return { kind: "allowed", ports };

  const access = funnelAccess(stdout, FUNNEL_PORTS[0]);

  return { kind: "denied", access: access === "no-funnel" ? access : "port-denied" };
}

export function freeFunnelPort(ports: number[], serve: string): number | undefined {
  return ports.find((port) => !portTaken(serve, port));
}
