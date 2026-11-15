import { setCheckoutPlacement } from "../../settings/placement.ts";
import { getUnlockPeriod, setUnlockPeriod } from "../../settings/unlock-period.ts";
import { settingRequest } from "../../settings/request.ts";
import { configText, settingText, unlockPeriodText } from "../../output/render/settings.ts";
import { secret } from "../../output/questions.ts";
import { createAdapters, type TAdapters } from "../../adapters.ts";
import { requireConfigured } from "../../state/configured.ts";
import { loadState } from "../../state/store/repository.ts";
import { Command } from "@commander-js/extra-typings";
import { readConfig, setConfig } from "../../settings/config.ts";

export const configCommand = new Command("config")
  .argument(
    "[key]",
    "telemetry, update-check, agent-merge, auto-approve-worktrees, unlock-period, placement or env-files",
  )
  .argument("[values...]", "New value; placement takes a checkout path and link or copy")
  .description("Read or change settings")
  .action(async (key, values) => {
    console.log(
      await applySetting(settingRequest(key, values), createAdapters(undefined, Date.now)),
    );
  });

async function applySetting(request: ReturnType<typeof settingRequest>, adapters: TAdapters) {
  switch (request.kind) {
    case "list":
      return configText(await readConfig(adapters.home));
    case "read":
      return request.key === "unlock-period"
        ? unlockPeriodText((await getUnlockPeriod(adapters, Date.now)).period)
        : settingText(request.key, await readConfig(adapters.home));
    case "placement":
      return settingText(
        "placement",
        await setCheckoutPlacement(adapters, request.checkout, request.mode),
      );
    case "unlock-period":
      requireConfigured(await loadState(adapters.home));
      await setUnlockPeriod(adapters, request.value, await secret("Master password"), Date.now);

      return `unlock-period: ${request.value}`;
    case "set":
      return settingText(
        request.key,
        await setConfig(request.key, request.value, adapters.home, Date.now),
      );
  }
}
