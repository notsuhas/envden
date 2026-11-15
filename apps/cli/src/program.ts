import { rmCommand } from "./commands/sync/rm.ts";
import { setUntrustedRoots } from "@envden/core/process";
import { loadState } from "./state/store/repository.ts";
import { shellCommand } from "./commands/shell/shell.ts";
import { untrackCommand } from "./commands/checkouts/untrack.ts";
import { sanitizeTerminal } from "./output/sanitize.ts";
import { reportTelemetry, commandOutcome } from "./output/telemetry.ts";
import { commandCounts } from "./output/counts.ts";
import { trackCommand } from "./commands/checkouts/track.ts";
import { localOnlyCommand } from "./commands/checkouts/local-only.ts";
import { vaultCommand } from "./commands/vault/vault.ts";
import { Command, type CommandUnknownOpts } from "@commander-js/extra-typings";
import { unlockCommand } from "./commands/onboarding/unlock.ts";
import { VERSION } from "./version.ts";
import { setupCommand } from "./commands/onboarding/setup.ts";
import { joinCommand } from "./commands/onboarding/join.ts";
import { statusCommand } from "./commands/sync/status.ts";
import { diffCommand } from "./commands/sync/diff.ts";
import { historyCommand } from "./commands/sync/history.ts";
import { resolveCommand } from "./commands/sync/resolve.ts";
import { aliasCommand } from "./commands/sync/alias.ts";
import { serveCommand } from "./commands/server/serve.ts";
import { updateCommand } from "./commands/maintenance/update.ts";
import { configCommand } from "./commands/maintenance/config.ts";
import { doctorCommand } from "./commands/maintenance/doctor.ts";
import { versionCommand } from "./commands/maintenance/version.ts";
import { pushCommand } from "./commands/sync/push.ts";
import { pullCommand } from "./commands/sync/pull.ts";
import { deviceCommand } from "./commands/device/device.ts";
import { serverCommand } from "./commands/server/server.ts";
import { agentCommand } from "./commands/agent/agent.ts";
import { uiCommand } from "./commands/ui/ui.ts";

import { createAdapters } from "./adapters.ts";
import { commandNotice } from "./notice/command.ts";

export function createProgram(now: () => number) {
  const program = new Command()
    .name("envden")
    .description("Encrypted whole-file env sync over your private network")
    .version(VERSION)
    .configureOutput({ outputError: (message, write) => write(sanitizeTerminal(message) + "\n") });

  let active: CommandUnknownOpts | undefined;

  program.hook("preAction", async (_program, command) => {
    const commandTime = now();

    const state = await loadState(createAdapters(undefined, now).home).catch(() => undefined);
    setUntrustedRoots(state?.approved.map((checkout) => checkout.root) ?? []);
    if (command.name() !== "status" || !command.opts().refreshCache) active = command;

    if (
      command.opts().json ||
      ["status", "version", "config", "help", "update"].includes(command.name())
    )
      return;

    try {
      const notice = await commandNotice(
        createAdapters(undefined, now),
        commandTime,
        fetch,
        false,
        process.cwd(),
      );

      reportCommandNotice(notice);
    } catch {
      // Notices must never prevent a command from running.
    }
  });

  addGroup(program, "Get started:", [setupCommand, joinCommand]);

  addGroup(program, "Daily use:", [
    statusCommand,
    pushCommand,
    pullCommand,
    diffCommand,
    resolveCommand,
    historyCommand,
  ]);

  addGroup(program, "Files:", [
    trackCommand,
    untrackCommand,
    localOnlyCommand,
    rmCommand,
    aliasCommand,
  ]);

  addGroup(program, "Devices and vault:", [
    deviceCommand,
    vaultCommand,
    serverCommand,
    unlockCommand,
  ]);

  addGroup(program, "Maintenance:", [
    configCommand,
    doctorCommand,
    updateCommand,
    uiCommand,
    agentCommand,
    shellCommand,
    serveCommand,
    versionCommand,
  ]);

  const parse = program.parseAsync.bind(program);

  program.parseAsync = async (...args) => {
    active = undefined;

    return commandCounts.run({}, async () => {
      return commandOutcome(
        () => parse(...args),
        async (outcome) => {
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        },
      );
    });
  };

  return program;
}

function addGroup(program: Command, heading: string, commands: CommandUnknownOpts[]) {
  program.commandsGroup(heading);
  for (const command of commands) program.addCommand(command);
}

function reportCommandNotice(notice: Awaited<ReturnType<typeof commandNotice>>) {
  for (const repo of notice.repos) console.error(`envden: ${repo} out of sync`);
  if (notice.update.available) console.error("envden: update available; run envden update");
  if (notice.update.required) console.error("envden: update required; run envden update");
}

function commandName(command: CommandUnknownOpts): string {
  const names = [command.name()];
  let parent = command.parent;

  while (parent?.parent) {
    names.unshift(parent.name());
    parent = parent.parent;
  }

  return names.join(" ");
}
