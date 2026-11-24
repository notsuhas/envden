import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArguments } from "./channels/options.ts";
import { downloadChecksums, renderFormula, publishFormula } from "./channels/workflow.ts";

async function main() {
  const { version, dryRun } = parseArguments(process.argv.slice(2));
  const directory = await mkdtemp(join(tmpdir(), "envden-channels-"));

  try {
    await downloadChecksums(version, directory);
    await renderFormula(version, directory, dryRun);
    await publishFormula(version, directory, dryRun);

    if (dryRun) console.log("Dry run complete. No commits or pushes made.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Channel publishing failed");
  if (error instanceof Error && error.cause instanceof Error) console.error(error.cause.message);
  process.exitCode = 1;
}
