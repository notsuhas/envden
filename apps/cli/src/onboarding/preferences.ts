import { deriveConsent, deriveShell, deriveAgent } from "./decisions.ts";
import { setConfig } from "../settings/config.ts";
import type { TAdapters } from "../adapters.ts";
import { installAgent } from "../agent/install.ts";
import { consent, shellChoice } from "../output/questions.ts";

import type { ILocalState } from "../state/model.ts";

type TOptions = {
  telemetry?: string;
  updateCheck?: string;
  yes?: boolean;
  shell?: string;
  agent?: string;
};

export async function setupPreferences(adapters: TAdapters, state: ILocalState, options: TOptions) {
  state.telemetry = await consentPreference(
    options.telemetry,
    options.yes,
    false,
    "Enable anonymous telemetry?",
  );

  state.updateCheck = await consentPreference(
    options.updateCheck,
    options.yes,
    true,
    "Check for updates daily?",
  );

  await setConfig("telemetry", state.telemetry ? "on" : "off", adapters.home);
  await setConfig("update-check", state.updateCheck ? "on" : "off", adapters.home);
  await installShell(adapters, options);

  await installAgentPreference(adapters, options);
}

async function consentPreference(
  value: string | undefined,
  yes: boolean | undefined,
  fallback: boolean,
  question: string,
) {
  const decision = deriveConsent(value, yes, fallback);

  return decision.kind === "selected" ? decision.value : consent(question);
}

async function installShell(adapters: TAdapters, options: TOptions) {
  const shell = options.shell ?? (options.yes ? "none" : await shellChoice());

  const selection = deriveShell(shell);
  if (selection.kind === "install") await adapters.shell(selection.shell).install(process.execPath);
}

async function installAgentPreference(adapters: TAdapters, options: TOptions) {
  const agent = deriveAgent(options.agent, options.yes);

  if (
    agent.kind === "install" ||
    (agent.kind === "ask" && (await consent("Install the agent skill?")))
  )
    await installAgent(adapters.userHome);
}
