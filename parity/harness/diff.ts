import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function difference(expected: string, actual: string, name: string) {
  const root = await mkdtemp(join(tmpdir(), "envden-parity-diff-"));

  try {
    await writeFile(join(root, "expected"), expected);
    await writeFile(join(root, "actual"), actual);

    const child = Bun.spawn(
      [
        "diff",
        "-u",
        "--label",
        "reference",
        "--label",
        name,
        join(root, "expected"),
        join(root, "actual"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const output = await new Response(child.stdout).text();
    await child.exited;

    return output.split("\n").slice(0, 100).join("\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
