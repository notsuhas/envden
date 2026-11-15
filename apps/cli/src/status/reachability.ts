import { EnvdenError } from "@envden/core/errors";

const transport: [string, string][] = [
  ["ConnectionRefused", "connection refused"],
  ["ECONNREFUSED", "connection refused"],
  ["ENOTFOUND", "address not found"],
  ["ECONNRESET", "connection reset"],
  ["CERT", "TLS certificate rejected"],
];

function transportReason(cause: unknown): string {
  if (!(cause instanceof Error)) return "network error";
  if (cause.name === "TimeoutError") return "timed out";

  const code = "code" in cause ? String(cause.code) : "";

  return transport.find(([prefix]) => code.includes(prefix))?.[1] ?? "network error";
}

export function serverReachability(error: unknown) {
  if (error instanceof EnvdenError && error.code === "SERVER_UNREACHABLE")
    return { server: "unreachable" as const, reason: transportReason(error.cause) };

  return {
    server: "error" as const,
    reason: error instanceof EnvdenError ? error.message : "unexpected error",
  };
}
