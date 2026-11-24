interface ISetupChoices {
  yes?: boolean;
  server?: string;
  hostServer?: boolean;
  telemetry?: string;
  updateCheck?: string;
  shell?: string;
  agent?: string;
  scanRoot?: string[];
  recoveryCodeOut?: string;
}

export function missingSetupFlags(interactive: boolean, choices: ISetupChoices): string[] {
  if (interactive || choices.yes) return [];

  return [
    ...(!choices.server && !choices.hostServer ? ["--server <url> or --host-server"] : []),
    ...(!choices.telemetry ? ["--telemetry on|off"] : []),
    ...(!choices.updateCheck ? ["--update-check on|off"] : []),
    ...(!choices.shell ? ["--shell zsh|bash|fish|powershell|none"] : []),
    ...(!choices.agent ? ["--agent on|off"] : []),
    ...(!choices.scanRoot?.length ? ["--scan-root <path...>"] : []),
    ...(!choices.recoveryCodeOut ? ["--recovery-code-out <file>"] : []),
  ];
}
