import { z } from "zod";
import { EnvdenError } from "@envden/core/errors";
import { withStateLock } from "../state/lock/lock.ts";
import { readFile } from "node:fs/promises";
import { ensurePaths, paths } from "./paths.ts";
import { atomicWrite } from "../state/store/files.ts";

const patternsSchema = z.array(z.string().min(1)).exactOptional();

const configSchema = z.strictObject({
  placement: z.record(z.string(), z.enum(["link", "copy"])).exactOptional(),
  "env-files": z
    .strictObject({
      include: patternsSchema,
      exclude: patternsSchema,
      extraSkipped: patternsSchema,
    })
    .exactOptional(),
  telemetry: z.boolean().default(false),
  "update-check": z.boolean().default(true),
  "agent-merge": z.boolean().default(false),
  "auto-approve-worktrees": z.boolean().default(true),
});

// Agents must not be able to widen what they can do without the user.
const terminalOnly = ["agent-merge", "auto-approve-worktrees"];

export function parseConfig(value: unknown) {
  const result = configSchema.safeParse(value);

  if (!result.success)
    throw new EnvdenError("INVALID_INPUT", "Invalid config", { cause: result.error });

  return result.data;
}

export async function readConfig(home: string) {
  try {
    const value: unknown = JSON.parse(await readFile(paths(home).config, "utf8"));

    return parseConfig(value);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return parseConfig({});

    if (error instanceof EnvdenError) throw error;
    throw new EnvdenError("INVALID_DATA", "Unreadable config", { cause: error });
  }
}

export async function setConfig(
  key: string,
  value: string,
  home: string,
  now: () => number,
  interactive = Boolean(process.stdin.isTTY),
) {
  if (terminalOnly.includes(key) && value === "on" && !interactive)
    throw new EnvdenError("INVALID_INPUT", `Turning on ${key} requires a terminal`);

  return withStateLock(paths(home).home, async () => {
    const current = await readConfig(home);

    const next = parseConfig({
      ...current,
      [key]:
        key === "placement" || key === "env-files" ? parseStructured(value) : parseToggle(value),
    });

    const location = await ensurePaths(home);
    await atomicWrite(location.config, `${JSON.stringify(next, null, 2)}\n`, now);

    return next;
  });
}

function parseToggle(value: string) {
  if (value !== "on" && value !== "off")
    throw new EnvdenError("INVALID_INPUT", "Expected on or off");

  return value === "on";
}

function parseStructured(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "Expected a JSON settings object", { cause });
  }
}
