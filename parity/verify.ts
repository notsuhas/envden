import { output } from "./runtime/process/output.ts";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const reference = resolve(process.argv[2] ?? "apps/cli/dist/envden");
const directory = await mkdtemp(join(tmpdir(), "parity-tamper-"));

const mutations = [
  ["stdout", 'console.log("deliberately changed output");', "/stdout"],
  ["stderr", 'console.error("deliberately changed error");', "/stderr"],
  ["exit", "process.exitCode = 7;", "/exit"],
  [
    "content",
    'await Bun.write(join(process.env.HOME!, "evidence.txt"), "deliberately changed content\\n");',
    "evidence.txt:content",
  ],
  ["mode", 'await chmod(join(process.env.HOME!, "evidence.txt"), 0o644);', "evidence.txt:mode"],
  [
    "db",
    'const db = new Database(join(process.env.HOME!, "evidence.sqlite")); db.run("UPDATE evidence SET value = \'deliberately changed row\'"); db.close();',
    "evidence.sqlite:db",
  ],
];

try {
  for (const [name, mutation, marker] of mutations) {
    if (!name || !mutation || !marker) throw new Error("Invalid mutation");
    const wrapper = join(directory, name);
    await writeFile(
      wrapper,
      `#!/usr/bin/env bun\nimport { Database } from "bun:sqlite";\nimport { chmod } from "node:fs/promises";\nimport { join } from "node:path";\nconst child = Bun.spawn([${JSON.stringify(reference)}, ...process.argv.slice(2)], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });\nprocess.exitCode = await child.exited;\n${mutation}\n`,
    );
    await chmod(wrapper, 0o755);
    const child = Bun.spawn(
      [
        process.execPath,
        resolve("parity/run.ts"),
        "--reference",
        reference,
        "--candidate",
        wrapper,
        "--scenario",
        "channel-probe",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const { stdout, stderr, code } = await output(child);

    if (code === 0 || !stderr.includes(marker) || !stderr.includes("@@"))
      throw new Error(`Missed ${name} tampering\n${stdout}\n${stderr}`);
    console.log(`Detected ${name} tampering`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
