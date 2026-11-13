import { readFile, rename, writeFile } from "node:fs/promises";
import { ensurePaths, paths } from "./paths.ts";

interface IConfig {
  telemetry: boolean;
  "update-check": boolean;
  "agent-merge": boolean;
  "allow-version"?: string;
}

export function parseConfig(value: unknown): IConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid config object");

  for (const [key, item] of Object.entries(value)) {
    if (key === "allow-version") {
      if (typeof item !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(item))
        throw new Error("Invalid allow-version");
    } else if (
      !["telemetry", "update-check", "agent-merge"].includes(key) ||
      typeof item !== "boolean"
    )
      throw new Error(`Invalid config key or value: ${key}`);
  }

  return { telemetry: false, "update-check": true, "agent-merge": false, ...value };
}

export async function readConfig(home?: string) {
  try {
    return parseConfig(JSON.parse(await readFile(paths(home).config, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return parseConfig({});

    throw error;
  }
}

export async function setConfig(key: string, value: string, home?: string) {
  const current = await readConfig(home);

  const next = parseConfig({
    ...current,
    [key]: key === "allow-version" ? value : parseToggle(value),
  });

  const location = await ensurePaths(home);
  const temporary = `${location.config}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, location.config);

  return next;
}

function parseToggle(value: string) {
  if (value !== "on" && value !== "off") throw new Error("Expected on or off");

  return value === "on";
}
