import { deriveConsent, deriveShell, deriveAgent, type TShell } from "./decisions.ts";
import { readConfig, setConfig } from "../settings/config.ts";
import type { TAdapters } from "../adapters.ts";
import { installAgent } from "../agent/install.ts";
import { consent, shellChoice } from "../output/prompts/questions.ts";

export type TPreferenceOptions = {
  telemetry?: "on" | "off";
  updateCheck?: "on" | "off";
  yes?: boolean;
  shell?: TShell | "none";
  agent?: "on" | "off";
};

export async function setupPreferences(adapters: TAdapters, options: TPreferenceOptions) {
  // a person at the prompt sees Yes first; unattended runs (--yes, agents) still leave it off
  const telemetry = await consentPreference(
    options.telemetry,
    options.yes,
    false,
    "Enable anonymous telemetry?",
    true,
  );

  const updateCheck = await consentPreference(
    options.updateCheck,
    options.yes,
    true,
    "Check for updates daily?",
  );

  await setConfig("telemetry", telemetry ? "on" : "off", adapters.home, adapters.now);
  await setConfig("update-check", updateCheck ? "on" : "off", adapters.home, adapters.now);
  await installShell(adapters, options);

  await installAgentPreference(adapters, options);
}

async function consentPreference(
  value: string | undefined,
  yes: boolean | undefined,
  fallback: boolean,
  question: string,
  prompted = fallback,
) {
  const decision = deriveConsent(value, yes || !process.stdin.isTTY, fallback);

  return decision.kind === "selected" ? decision.value : consent(question, prompted);
}

async function installShell(adapters: TAdapters, options: TPreferenceOptions) {
  const shell =
    options.shell ?? (options.yes || !process.stdin.isTTY ? "none" : await shellChoice());

  const selection = deriveShell(shell);

  if (selection.kind === "install")
    await adapters
      .shell(selection.shell)
      .install(adapters.executable)
      .catch(skipped("the shell notice", "envden shell install"));
}

// optional extras must not undo a setup that already created the vault
function skipped(what: string, later: string) {
  return (error: unknown) => {
    const reason = error instanceof Error ? error.message : "unknown error";
    console.error(`Skipped ${what}: ${reason}. Set it up later with: ${later}`);
  };
}

async function installAgentPreference(adapters: TAdapters, options: TPreferenceOptions) {
  const agent = deriveAgent(options.agent, options.yes || !process.stdin.isTTY);

  if (
    agent.kind === "install" ||
    (agent.kind === "ask" &&
      (await consent(
        "Install the agent skill? It teaches AI coding agents like Claude Code and Codex to use envden safely",
        true,
      )))
  )
    await installAgent(adapters.userHome, adapters.now).catch(
      skipped("the agent skill", "envden agent install"),
    );
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
