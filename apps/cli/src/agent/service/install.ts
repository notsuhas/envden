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
    pause: (ms: number) => Promise<void>;
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

    await bootstrap(
      () => options.run(["launchctl", "bootstrap", `gui/${options.uid}`, path]),
      options.pause,
    );
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

// bootout returns while launchd is still tearing the old job down, so the first bootstrap can fail
async function bootstrap(load: () => Promise<void>, pause: (ms: number) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= BOOTSTRAP_ATTEMPTS) throw error;
      await pause(BOOTSTRAP_PAUSE_MS);
    }
  }
}

const BOOTSTRAP_ATTEMPTS = 10;
const BOOTSTRAP_PAUSE_MS = 300;

export async function runServiceCommand(args: string[]) {
  const child = spawnTrusted(args[0]!, args.slice(1), { stdout: "ignore", stderr: "pipe" });
  const [stderr, result] = await Promise.all([new Response(child.stderr).text(), child.exited]);

  if (result !== 0)
    throw new EnvdenError(
      "INTERNAL",
      `Could not start the envden server service: ${stderr.trim().slice(0, 300) || `${args[0]} exited ${result}`}`,
    );
}
