import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Normalizer } from "../../normalize/normalizer.ts";
import { command } from "../process/command.ts";
import { environment } from "../device/environment.ts";

export interface IDevice {
  home: string;
  checkout: string;
  env: ReturnType<typeof environment>;
  binary: string;
}

export function deviceStore(
  root: string,
  normalizer: Normalizer,
  binary: (role: string) => string,
) {
  const devices = new Map<string, IDevice>();

  function get(name: string): IDevice {
    const device = devices.get(name);
    if (!device) throw new Error(`Unknown device ${name}`);

    return device;
  }

  async function git(name: string, args: string[]): Promise<void> {
    const d = get(name);
    const output = await command({ argv: ["git", ...args], cwd: d.checkout, env: d.env });

    if (output.code !== 0) throw new Error(output.stderr);
  }

  async function device(name: string, contents?: string): Promise<IDevice> {
    const home = join(root, name, "home");
    const checkout = join(home, "app");
    const temporary = join(root, name, "tmp");

    await mkdir(checkout, { recursive: true });
    await mkdir(temporary, { recursive: true });

    const env = environment(root, name, home, temporary);
    const created = { home, checkout, env, binary: name === "host" ? "" : binary(name) };

    devices.set(name, created);
    normalizer.path(home, `home-${name}`);
    normalizer.path(await realpath(home), `home-${name}`);
    normalizer.path(env.ENVDEN_HOME, `envden-${name}`);

    if (env.ENVDEN_HOME.startsWith("/var/"))
      normalizer.path(`/private${env.ENVDEN_HOME}`, `envden-${name}`);

    await git(name, ["init", "--quiet", "--initial-branch=main"]);
    await git(name, ["remote", "add", "origin", "https://example.com/envden/parity.git"]);
    await writeFile(join(checkout, ".gitignore"), ".env*\n");
    await git(name, ["add", ".gitignore"]);
    await git(name, ["commit", "-qm", "initial"]);

    if (contents !== undefined) {
      normalizer.literal(contents);
      await writeFile(join(checkout, ".env"), contents);
    }

    return created;
  }

  return { devices, get, git, device };
}
