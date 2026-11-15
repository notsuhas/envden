import { millisecondsInDay } from "date-fns/constants";
import { sanitizeConsole } from "../sanitize.ts";
import type { readConfig } from "../../settings/config.ts";
import type { TSetting } from "../../settings/request.ts";
import { telemetryEnabled, updateCheckEnabled } from "../../settings/privacy.ts";

type TConfig = Awaited<ReturnType<typeof readConfig>>;

type TLocalSetting = Exclude<TSetting, "unlock-period">;

const LOCAL: TLocalSetting[] = [
  "telemetry",
  "update-check",
  "agent-merge",
  "auto-approve-worktrees",
  "placement",
  "env-files",
];

export function configText(config: TConfig, env: NodeJS.ProcessEnv = process.env) {
  return LOCAL.map((key) => settingText(key, config, env)).join("\n");
}

export function settingText(
  key: TLocalSetting,
  config: TConfig,
  env: NodeJS.ProcessEnv = process.env,
) {
  switch (key) {
    case "telemetry":
      return toggleText(key, config.telemetry, telemetryEnabled(config.telemetry, env));
    case "update-check":
      return toggleText(
        key,
        config["update-check"],
        updateCheckEnabled(config["update-check"], env),
      );
    case "agent-merge":
    case "auto-approve-worktrees":
      return toggleText(key, config[key], config[key]);
    case "placement":
      return listText(
        key,
        Object.entries(config.placement ?? {}).map(([root, mode]) => `${root}: ${mode}`),
      );
    case "env-files":
      return listText(
        key,
        Object.entries(config["env-files"] ?? {}).map(
          ([name, patterns]) => `${name}: ${patterns.join(", ")}`,
        ),
      );
  }
}

export function unlockPeriodText(period: number | null) {
  return `unlock-period: ${period === null ? "never" : `${period / millisecondsInDay}d`}`;
}

function toggleText(key: string, configured: boolean, effective: boolean) {
  const value = effective ? "on" : "off";

  return configured === effective
    ? `${key}: ${value}`
    : `${key}: ${value} (set to ${configured ? "on" : "off"}; the environment overrides it)`;
}

function listText(key: string, lines: string[]) {
  if (!lines.length) return `${key}: default`;

  return sanitizeConsole([`${key}:`, ...lines.map((line) => `  ${line}`)].join("\n"));
}
