import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { readConfig, setConfig } from "../../settings/config.ts";
import { consent } from "../../output/questions.ts";
import type { TAdapters } from "../../adapters.ts";

export async function checkoutPlacement(
  adapters: TAdapters,
  root: string,
  copy = false,
  ask = consent,
  interactive = !!process.stdin.isTTY,
) {
  const config = await readConfig(adapters.home);
  const configured = config.placement?.[root];

  if (copy) {
    await setConfig(
      "placement",
      JSON.stringify({ ...config.placement, [root]: "copy" }),
      adapters.home,
      adapters.now,
    );

    return "copy" as const;
  }

  if (configured) return configured;

  if (interactive && hasContainerFiles(await readdir(root, { withFileTypes: true }))) {
    const mode = (await ask("Container configuration detected. Use copy mode for this checkout?"))
      ? "copy"
      : "link";

    await setConfig(
      "placement",
      JSON.stringify({ ...config.placement, [root]: mode }),
      adapters.home,
      adapters.now,
    );

    return mode;
  }

  return "link" as const;
}

function hasContainerFiles(entries: Dirent[]) {
  return entries.some((entry) =>
    entry.name === ".devcontainer"
      ? entry.isDirectory()
      : entry.isFile() &&
        (entry.name === "Dockerfile" || /^docker-compose.*\.yml$/.test(entry.name)),
  );
}
