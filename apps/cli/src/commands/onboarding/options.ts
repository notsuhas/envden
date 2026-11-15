import { Option, type Command, type OptionValues } from "@commander-js/extra-typings";
import { SHELLS, TOGGLES } from "../../onboarding/decisions.ts";

export function withPreferences<
  A extends unknown[],
  O extends OptionValues,
  G extends OptionValues,
>(command: Command<A, O, G>) {
  return command
    .addOption(new Option("--telemetry <choice>", "Anonymous telemetry").choices(TOGGLES))
    .addOption(new Option("--update-check <choice>", "Daily update check").choices(TOGGLES))
    .addOption(new Option("--shell <shell>", "Shell notice").choices([...SHELLS, "none"] as const))
    .addOption(new Option("--agent <choice>", "Install the agent skill").choices(TOGGLES));
}
