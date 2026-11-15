import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./run.ts";

export interface IDevice {
  name: string;
  home: string;
  checkout: string;
  env: Record<string, string>;
}

export async function createDevice(root: string, name: string, env?: string): Promise<IDevice> {
  const home = join(root, name, "home");
  const checkout = join(home, "app");

  await mkdir(checkout, { recursive: true });
  await git(checkout, ["init", "--quiet"], home);
  await git(checkout, ["remote", "add", "origin", "https://example.com/envden/e2e.git"], home);
  await writeFile(join(checkout, ".gitignore"), ".env\n");
  if (env !== undefined) await writeFile(join(checkout, ".env"), env);

  return {
    name,
    home,
    checkout,
    env: {
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      ENVDEN_HOME: join(root, name, "envden"),
      ENVDEN_NO_UPDATE_CHECK: "1",
      ENVDEN_TELEMETRY: "0",
      PATH: process.env.PATH ?? "",
      TMPDIR: tmpdir(),
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
    },
  };
}
