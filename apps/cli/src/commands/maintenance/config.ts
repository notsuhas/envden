import { setCheckoutPlacement } from "../../settings/placement.ts";
import { getUnlockPeriod, setUnlockPeriod } from "../../settings/unlock-period.ts";
import { secret } from "../../output/questions.ts";
import { EnvdenError } from "@envden/core/errors";
import { createAdapters } from "../../adapters.ts";
import { telemetryEnabled, updateCheckEnabled } from "../../settings/privacy.ts";
import { Command } from "@commander-js/extra-typings";
import { readConfig, setConfig } from "../../settings/config.ts";

export const configCommand = new Command("config")
  .argument("[key]")
  .argument("[values...]")
  .description(
    "Get/set telemetry, update-check, agent-merge, allow-version, unlock-period, placement <path> link|copy or env-files <JSON>",
  )
  .action(async (key, values) => {
    const value = values?.[0];

    if (key === "placement" && value !== undefined) {
      if (values?.length !== 2)
        throw new EnvdenError("INVALID_INPUT", "Expected placement <checkout> link|copy");

      console.log(JSON.stringify(await setCheckoutPlacement(createAdapters(), value, values[1])));

      return;
    }

    if (key === "unlock-period" && value === undefined) {
      console.log(JSON.stringify(await getUnlockPeriod(createAdapters(), () => Date.now())));

      return;
    }

    if (value !== undefined && key !== undefined) {
      if (key === "unlock-period") {
        await setUnlockPeriod(createAdapters(), value, await secret("Master password"), () =>
          Date.now(),
        );

        return;
      }

      requireInteractiveOverride(key, !!process.stdin.isTTY);

      console.log(JSON.stringify(await setConfig(key, value, createAdapters().home), null, 2));

      return;
    }

    const config = await readConfig(createAdapters().home);

    reportConfig(config, key);
  });

function reportConfig(config: Awaited<ReturnType<typeof readConfig>>, key: string | undefined) {
  if (key) {
    if (
      ![
        "telemetry",
        "update-check",
        "agent-merge",
        "allow-version",
        "placement",
        "env-files",
      ].includes(key)
    )
      throw new EnvdenError("INVALID_INPUT", "Unknown config key");

    console.log(JSON.stringify(Reflect.get(config, key) ?? null));
  } else
    console.log(
      JSON.stringify(
        {
          ...config,
          effective: {
            telemetry: telemetryEnabled(config.telemetry),
            "update-check": updateCheckEnabled(config["update-check"]),
          },
        },
        null,
        2,
      ),
    );
}

function requireInteractiveOverride(key: string, interactive: boolean) {
  if (key === "allow-version" && !interactive)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Accepting an unsafe version requires your own terminal",
    );
}
