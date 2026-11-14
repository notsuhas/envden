import { TELEMETRY_KEY } from "../settings/build-config.ts";
import { join } from "node:path";
import { ErrorCodeSchema, isEnvdenError } from "@envden/core/errors";
import type { TErrorCode } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { readConfig } from "../settings/config.ts";
import { telemetryEnabled } from "../settings/privacy.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { VERSION } from "../version.ts";

interface IEvent {
  command: string;
  success: boolean;
  errorCode?: TErrorCode;
  changed?: number;
  conflicts?: number;
}

export function telemetryPayload(id: string, event: IEvent) {
  const error = ErrorCodeSchema.safeParse(event.errorCode);

  return {
    event: "cli_command",
    properties: {
      distinct_id: id,
      version: VERSION,
      os: process.platform,
      command: event.command,
      success: event.success,
      ...(error.success ? { error_code: error.data } : {}),
      ...(Number.isSafeInteger(event.changed) && event.changed! >= 0
        ? { changed: event.changed }
        : {}),
      ...(Number.isSafeInteger(event.conflicts) && event.conflicts! >= 0
        ? { conflicts: event.conflicts }
        : {}),
      $ip: null,
      $geoip_disable: true,
    },
  };
}

export async function reportTelemetry(adapters: TAdapters, event: IEvent) {
  const projectKey = TELEMETRY_KEY;
  if (!projectKey) return;

  try {
    const config = await readConfig(adapters.home);
    if (!telemetryEnabled(config.telemetry)) return;

    const id = await withStateLock(adapters.home, async () => {
      const path = join(adapters.home, "state", "install-id");
      const saved = await optionalRead(path);
      if (saved) return saved;
      const generated = crypto.randomUUID();
      await atomicWrite(path, generated);

      return generated;
    });

    await fetch("https://us.i.posthog.com/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: projectKey, ...telemetryPayload(id, event) }),
      signal: AbortSignal.timeout(200),
      redirect: "error",
    });
  } catch {
    // Telemetry never affects a command's outcome.
  }
}

export async function commandOutcome<T>(
  action: () => Promise<T>,
  report: (event: { success: boolean; errorCode?: TErrorCode }) => Promise<void>,
) {
  try {
    const result = await action();
    void report({ success: true }).catch(() => {});

    return result;
  } catch (cause) {
    void report({
      success: false,
      errorCode: isEnvdenError(cause) ? cause.code : "INTERNAL",
    }).catch(() => {});

    throw cause;
  }
}
