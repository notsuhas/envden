import type { TJoinRequest } from "./approver.ts";

export type TPick =
  | { kind: "none" }
  | { kind: "missing" }
  | { kind: "picked"; request: TJoinRequest }
  | { kind: "choose"; requests: TJoinRequest[] };

export function pickRequest(requests: TJoinRequest[], number?: number): TPick {
  if (number !== undefined) {
    const request = requests.find((item) => item.number === number);

    return request ? { kind: "picked", request } : { kind: "missing" };
  }

  if (requests.length === 0) return { kind: "none" };
  if (requests.length === 1) return { kind: "picked", request: requests[0]! };

  return { kind: "choose", requests };
}
