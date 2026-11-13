import { EnvdenError } from "@envden/core/errors";
import { withStateLock } from "../state/lock/lock.ts";
import { readFile, rename, writeFile } from "node:fs/promises";
import { ensurePaths, paths } from "./paths.ts";

import type { IEnvFileRules } from "@envden/core/adapters";

interface IConfig {
  placement?: Record<string, "link" | "copy">;
  "env-files"?: IEnvFileRules;
  telemetry: boolean;
  "update-check": boolean;
  "agent-merge": boolean;
  "allow-version"?: string;
}

export function parseConfig(value: unknown): IConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new EnvdenError("INVALID_INPUT", "Invalid config object");

  for (const [key, item] of Object.entries(value)) validateSetting(key, item);

  return { telemetry: false, "update-check": true, "agent-merge": false, ...value };
}

export async function readConfig(home: string) {
  try {
    return parseConfig(JSON.parse(await readFile(paths(home).config, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return parseConfig({});

    if (error instanceof EnvdenError) throw error;
    throw new EnvdenError("INVALID_DATA", "Unreadable config", { cause: error });
  }
}

export async function setConfig(key: string, value: string, home: string) {
  return withStateLock(paths(home).home, async () => {
    const current = await readConfig(home);

    const next = parseConfig({
      ...current,
      [key]:
        key === "placement" || key === "env-files"
          ? parseStructured(value)
          : key === "allow-version"
            ? value
            : parseToggle(value),
    });

    const location = await ensurePaths(home);
    const temporary = `${location.config}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, location.config);

    return next;
  });
}

function parseToggle(value: string) {
  if (value !== "on" && value !== "off")
    throw new EnvdenError("INVALID_INPUT", "Expected on or off");

  return value === "on";
}

function parseEnvFileRules(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.entries(value).some(
      ([key, patterns]) =>
        !["include", "exclude", "extraSkipped"].includes(key) ||
        !Array.isArray(patterns) ||
        patterns.some((pattern) => typeof pattern !== "string" || !pattern.length),
    )
  )
    throw new EnvdenError("INVALID_INPUT", "Invalid env-file rules");
}

function parseStructured(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "Expected a JSON settings object", { cause });
  }
}

function validateSetting(key: string, item: unknown) {
  switch (key) {
    case "placement":
      return validatePlacement(item);
    case "env-files":
      return parseEnvFileRules(item);
    case "allow-version":
      if (typeof item === "string" && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(item)) return;
      throw new EnvdenError("INVALID_INPUT", "Invalid allow-version");
    default:
      if (["telemetry", "update-check", "agent-merge"].includes(key) && typeof item === "boolean")
        return;

      throw new EnvdenError("INVALID_INPUT", "Invalid config key or value");
  }
}

function validatePlacement(item: unknown) {
  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    Object.values(item).some((mode) => mode !== "link" && mode !== "copy")
  )
    throw new EnvdenError("INVALID_INPUT", "Invalid placement settings");
}
