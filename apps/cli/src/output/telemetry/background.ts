import { spawnTrusted } from "@envden/core/process";

export const TELEMETRY_BODY = "ENVDEN_TELEMETRY_BODY";
export const TELEMETRY_SEND_COMMAND = "telemetry-send";

// a compiled binary's own path is argv[0]; from source, bun needs the entry script too
export function selfCommand(argv: string[], execPath: string) {
  const compiled = /^(\/\$bunfs\/|[A-Z]:\\~BUN\\)/.test(argv[1] ?? "");

  return [execPath, ...(compiled ? [] : [argv[1]!]), TELEMETRY_SEND_COMMAND];
}

// a reachable PostHog takes ~0.7 s over HTTPS, so a detached child sends it and the command exits at once
export function sendInBackground(body: string) {
  try {
    const child = spawnTrusted(selfCommand(process.argv, process.execPath), {
      stdout: "ignore",
      stderr: "ignore",
      env: childEnvironment(body),
    });

    child.unref();
  } catch {
    // telemetry never affects a command's outcome
  }
}

// spawnTrusted drops everything else, so network settings the send needs are passed on by name
const NETWORK_SETTINGS = [
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
].flatMap((name) => [name, name.toLowerCase()]);

export function childEnvironment(
  body: string,
  inherited: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const passed = ["ENVDEN_HOME", ...NETWORK_SETTINGS].filter((name) => inherited[name]);

  return {
    [TELEMETRY_BODY]: body,
    ENVDEN_NO_UPDATE_CHECK: "1",
    ...Object.fromEntries(passed.map((name) => [name, inherited[name]!])),
  };
}

export async function deliverTelemetry(body: string | undefined) {
  if (!body) return;

  await fetch("https://us.i.posthog.com/capture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  }).catch(() => {});
}
