import { mkdir } from "node:fs/promises";
import { writeHostShims } from "./shims.ts";

if (
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.platform !== "linux"
)
  throw new Error("Host shims require a disposable Linux GitHub runner");

const directory = process.argv[2];

if (!directory) throw new Error("Give a shim output directory");

await mkdir(directory, { recursive: true });

await writeHostShims(directory, '"$HOME/host-tools.log"');
