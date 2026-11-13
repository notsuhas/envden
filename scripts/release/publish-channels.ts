import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArguments } from "./channels/options.ts";
import {
  downloadChecksums,
  renderFiles,
  writeWinget,
  publishChannels,
} from "./channels/workflow.ts";

async function main() {
  const { version, dryRun } = parseArguments(process.argv.slice(2));
  const directory = await mkdtemp(join(tmpdir(), "envden-channels-"));
  const renderedDirectory = join(directory, "rendered");
  let rendered = false;

  try {
    await downloadChecksums(version, directory);
    await renderFiles(version, directory, dryRun);

    rendered = true;
    const wingetDirectory = await writeWinget(version, renderedDirectory, dryRun);
    await publishChannels(version, directory, dryRun);

    const submitDirectory = dryRun ? join(renderedDirectory, "winget") : wingetDirectory;

    console.log(
      `Submit winget manually:\n1. Fork https://github.com/microsoft/winget-pkgs and create a branch from its current master.\n2. Copy the three YAML files from ${submitDirectory} into manifests/n/notsuhas/envden/${version}/ in that fork.\n3. Commit and push that branch, then open a PR against microsoft/winget-pkgs:master.`,
    );

    if (dryRun) console.log("Dry run complete. No commits or pushes made.");
  } finally {
    await rm(join(directory, "homebrew-tap"), { recursive: true, force: true });
    await rm(join(directory, "scoop-bucket"), { recursive: true, force: true });

    if (!rendered) await rm(directory, { recursive: true, force: true });
    else console.log(`Rendered files kept at ${renderedDirectory}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Channel publishing failed");
  if (error instanceof Error && error.cause instanceof Error) console.error(error.cause.message);
  process.exitCode = 1;
}
