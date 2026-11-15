import { EnvdenError } from "@envden/core/errors";
import { unlockPeriod } from "./unlock-period.ts";

const TOGGLES = ["telemetry", "update-check", "agent-merge", "auto-approve-worktrees"] as const;
const SETTINGS = [...TOGGLES, "unlock-period", "placement", "env-files"] as const;

export type TSetting = (typeof SETTINGS)[number];

const SETTING_NAMES = SETTINGS.join(", ");

// Checks the whole request up front so no password prompt precedes a typo.
export function settingRequest(key: string | undefined, values: string[] = []) {
  if (key === undefined) return { kind: "list" } as const;

  if (!isSetting(key))
    throw new EnvdenError(
      "INVALID_INPUT",
      `Unknown setting '${key}'. Valid settings: ${SETTING_NAMES}`,
    );

  const [value, ...rest] = values;

  if (value === undefined) return { kind: "read", key } as const;

  if (key === "placement") {
    if (rest.length !== 1 || (rest[0] !== "link" && rest[0] !== "copy"))
      throw new EnvdenError("INVALID_INPUT", "Expected placement <checkout> link|copy");

    return { kind: "placement", checkout: value, mode: rest[0] } as const;
  }

  if (rest.length) throw new EnvdenError("INVALID_INPUT", `Expected one value for ${key}`);

  if (key === "unlock-period") {
    unlockPeriod(value);

    return { kind: "unlock-period", value } as const;
  }

  if (key !== "env-files" && value !== "on" && value !== "off")
    throw new EnvdenError("INVALID_INPUT", `Expected on or off for ${key}`);

  return { kind: "set", key, value } as const;
}

function isSetting(key: string): key is TSetting {
  return (SETTINGS as readonly string[]).includes(key);
}
