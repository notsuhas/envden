import { EnvdenError } from "@envden/core/errors";
import { deriveConsent, deriveShell, deriveAgent } from "./decisions.ts";
import { readConfig, setConfig } from "../settings/config.ts";
import type { TAdapters } from "../adapters.ts";
import { installAgent } from "../agent/install.ts";
import { consent, shellChoice } from "../output/questions.ts";

export type TPreferenceOptions = {
  telemetry?: string;
  updateCheck?: string;
  yes?: boolean;
  shell?: string;
  agent?: string;
};

export async function setupPreferences(adapters: TAdapters, options: TPreferenceOptions) {
  for (const value of [options.telemetry, options.updateCheck, options.agent])
    if (value !== undefined && value !== "on" && value !== "off")
      throw new EnvdenError("INVALID_INPUT", "Expected on or off");

  if (
    options.shell !== undefined &&
    options.shell !== "none" &&
    deriveShell(options.shell).kind !== "install"
  )
    throw new EnvdenError("INVALID_INPUT", "Unknown shell");

  const telemetry = await consentPreference(
    options.telemetry,
    options.yes,
    false,
    "Enable anonymous telemetry?",
  );

  const updateCheck = await consentPreference(
    options.updateCheck,
    options.yes,
    true,
    "Check for updates daily?",
  );

  await setConfig("telemetry", telemetry ? "on" : "off", adapters.home);
  await setConfig("update-check", updateCheck ? "on" : "off", adapters.home);
  await installShell(adapters, options);

  await installAgentPreference(adapters, options);
}

async function consentPreference(
  value: string | undefined,
  yes: boolean | undefined,
  fallback: boolean,
  question: string,
) {
  const decision = deriveConsent(value, yes || !process.stdin.isTTY, fallback);

  return decision.kind === "selected" ? decision.value : consent(question);
}

async function installShell(adapters: TAdapters, options: TPreferenceOptions) {
  const shell =
    options.shell ?? (options.yes || !process.stdin.isTTY ? "none" : await shellChoice());

  const selection = deriveShell(shell);
  if (selection.kind === "install") await adapters.shell(selection.shell).install(process.execPath);
}

async function installAgentPreference(adapters: TAdapters, options: TPreferenceOptions) {
  const agent = deriveAgent(options.agent, options.yes || !process.stdin.isTTY);

  if (
    agent.kind === "install" ||
    (agent.kind === "ask" && (await consent("Install the agent skill?")))
  )
    await installAgent(adapters.userHome, adapters.now);
}

export async function updatePreferences(adapters: TAdapters, options: TPreferenceOptions) {
  const config = await readConfig(adapters.home);

  await setupPreferences(adapters, {
    ...options,
    yes: options.yes ?? true,
    telemetry: options.telemetry ?? (config.telemetry ? "on" : "off"),
    updateCheck: options.updateCheck ?? (config["update-check"] ? "on" : "off"),
  });
}
