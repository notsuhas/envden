import { telemetryEnabled, updateCheckEnabled } from "../../settings/privacy.ts";
import { Command } from "@commander-js/extra-typings";
import { readConfig, setConfig } from "../../settings/config.ts";

export const configCommand = new Command("config")
  .argument("[key]")
  .argument("[value]")
  .description("Get/set telemetry, update-check, agent-merge or allow-version")
  .action(async (key, value) => {
    if (value !== undefined && key !== undefined) {
      requireInteractiveOverride(key, !!process.stdin.isTTY);

      console.log(JSON.stringify(await setConfig(key, value), null, 2));

      return;
    }

    const config = await readConfig();

    reportConfig(config, key);
  });

function reportConfig(config: Awaited<ReturnType<typeof readConfig>>, key: string | undefined) {
  if (key) {
    if (!["telemetry", "update-check", "agent-merge", "allow-version"].includes(key))
      throw new Error(`Unknown config key: ${key}`);

    console.log(JSON.stringify(Reflect.get(config, key) ?? null));
  } else
    console.log(
      JSON.stringify(
        {
          ...config,
          effective: {
            telemetry: telemetryEnabled(config.telemetry, !!process.stdin.isTTY),
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
    throw new Error("Accepting an unsafe version requires your own terminal");
}
