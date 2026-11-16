import { realpath, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Normalizer } from "../normalize/normalizer.ts";
import type { IOutput } from "./process/types.ts";

export async function prepare(
  devices: Iterable<{ env: { ENVDEN_HOME: string } }>,
  normalizer: Normalizer,
  outputs: IOutput[],
): Promise<string[]> {
  const names: string[] = [];
  const transcript = outputs.map((output) => `${output.stdout}\n${output.stderr}`).join("\n");

  for (const d of devices) {
    const home = await realpath(d.env.ENVDEN_HOME).catch(() => d.env.ENVDEN_HOME);

    for (const slot of [
      "device",
      "rejoin/device",
      "id-key",
      ...Array.from({ length: 20 }, (_, i) => `epoch/${i + 1}`),
    ]) {
      const hash = createHash("sha256").update(`envden/${home}/${slot}`).digest("hex");
      normalizer.path(hash, `key-slot:${slot}`);
    }

    const backupDir = join(home, "conflicts/backups");
    const backups = await readdir(backupDir).catch(() => []);
    const occurrences = new Map<string, number>();

    for (const file of backups.sort((a, b) => {
      const left = transcript.indexOf(a);
      const right = transcript.indexOf(b);

      if (left !== right && (left >= 0 || right >= 0))
        return (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right);

      return a.localeCompare(b);
    })) {
      const bytes = await readFile(join(backupDir, file));
      const hash = createHash("sha256").update(bytes).digest("hex");
      const ordinal = (occurrences.get(hash) ?? 0) + 1;
      occurrences.set(hash, ordinal);
      normalizer.path(file, `backup:${hash}:${ordinal}`);
    }

    const state = await readFile(join(home, "state/device.json"), "utf8").catch(() => "");
    normalizer.text(state);
    if (state) collectNames(JSON.parse(state), names);
  }

  return names;
}

function collectNames(value: unknown, names: string[]): void {
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (["deviceName", "repoId"].includes(key) && typeof child === "string") names.push(child);
    else collectNames(child, names);
  }
}
