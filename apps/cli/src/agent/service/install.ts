import { spawnTrusted } from "@envden/core/process";
import { join } from "node:path";
import type { atomicWrite } from "../../state/store/files.ts";
import { EnvdenError } from "@envden/core/errors";
import { serviceDefinition } from "./generate.ts";
import { serviceFile } from "./location.ts";

export async function installHostService(
  options: {
    platform: string;
    executable: string;
    userHome: string;
    home: string;
    uid: number;
    write: typeof atomicWrite;
    run: (args: string[]) => Promise<void>;
  },
  now: () => number,
) {
  const log = join(options.home, "server.log");

  const definition = serviceDefinition(
    options.platform,
    options.executable,
    join(options.home, "server"),
    log,
  );

  const path = serviceFile(options.platform, options.userHome, options.home)!;

  if (definition.kind === "launchd") {
    await options.write(path, definition.content, now);

    await options
      .run(["launchctl", "bootout", `gui/${options.uid}/com.envden.server`])
      .catch(() => {});

    await options.run(["launchctl", "bootstrap", `gui/${options.uid}`, path]);
  } else if (definition.kind === "systemd") {
    await options.write(path, definition.content, now);
    await options.run(["systemctl", "--user", "daemon-reload"]);
    await options.run(["systemctl", "--user", "enable", "envden.service"]);
    await options.run(["systemctl", "--user", "restart", "envden.service"]);
  } else {
    await options.write(path, new Uint8Array(Buffer.from(definition.content, "utf16le")), now);
    await options.run(["schtasks", "/End", "/TN", "envden"]).catch(() => {});
    await options.run(["schtasks", "/Create", "/TN", "envden", "/XML", path, "/F"]);
    await options.run(["schtasks", "/Run", "/TN", "envden"]);
  }

  return { log, path };
}

export async function runServiceCommand(args: string[]) {
  const result = await spawnTrusted(args[0]!, args.slice(1), { stdout: "ignore", stderr: "ignore" })
    .exited;

  if (result !== 0)
    throw new EnvdenError("INVALID_INPUT", "Could not install the envden login service");
}
