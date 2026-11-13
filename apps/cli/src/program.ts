import { vaultCommand } from "./commands/vault/vault.ts";
import { Command } from "@commander-js/extra-typings";
import { unlockCommand } from "./commands/onboarding/unlock.ts";
import { VERSION } from "./version.ts";
import { setupCommand } from "./commands/onboarding/setup.ts";
import { joinCommand } from "./commands/onboarding/join.ts";
import { statusCommand } from "./commands/sync/status.ts";
import { diffCommand } from "./commands/sync/diff.ts";
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

import { createAdapters } from "./adapters.ts";
import { commandNotice } from "./notice/command.ts";

export function createProgram() {
  const program = new Command()
    .name("envden")
    .description("Encrypted whole-file env sync over your private network")
    .version(VERSION);

  program.hook("preAction", async (_program, command) => {
    if (command.name() === "status" && command.opts().refreshCache) return;
    const notice = await commandNotice(createAdapters(), Date.now(), fetch, false, process.cwd());

    reportCommandNotice(notice);
  });

  program.addCommand(setupCommand);
  program.addCommand(unlockCommand);
  program.addCommand(joinCommand);
  program.addCommand(statusCommand);
  program.addCommand(diffCommand);
  program.addCommand(resolveCommand);
  program.addCommand(aliasCommand);
  program.addCommand(serveCommand);
  program.addCommand(updateCommand);
  program.addCommand(configCommand);
  program.addCommand(doctorCommand);
  program.addCommand(versionCommand);
  program.addCommand(pushCommand);
  program.addCommand(pullCommand);
  program.addCommand(deviceCommand);
  program.addCommand(serverCommand);
  program.addCommand(agentCommand);

  program.addCommand(vaultCommand);

  return program;
}

function reportCommandNotice(notice: Awaited<ReturnType<typeof commandNotice>>) {
  for (const repo of notice.repos) console.error(`envden: ${repo} out of sync`);
  if (notice.update.available) console.error("envden: update available; run envden update");
  if (notice.update.required) console.error("envden: this version is unsafe; update required");
}
