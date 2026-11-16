import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { semanticOutput } from "../harness/terminal/semantic.ts";
import { capture } from "../harness/snapshot.ts";
import { Context } from "../harness/context.ts";

const declared = {
  root: "setup join status push pull diff resolve history track untrack local-only rm alias device vault server unlock config doctor update ui agent shell serve version",
  device: "add ls rename rm",
  vault: "rotate kit password",
  server: "move switch repair",
  setup:
    "--yes --server --kit-out --name --host-server --setup-token --telemetry --update-check --shell --agent --scan-root --exclude-root --verbose",
  join: "--recovery --recovery-kit --name --yes --telemetry --update-check --shell --agent --resume",
  resolve: "--json --list --repo --keep-mine --take-server",
};

function help(implementation: string, command: string): string {
  return readFileSync(
    new URL(`./fixtures/help/${implementation}-${command}.txt`, import.meta.url),
    "utf8",
  );
}

for (const [command, names] of Object.entries(declared)) {
  test(`${command} help compares declared names across captured layouts`, () => {
    const expected = names.split(" ").sort();

    for (const implementation of ["ts", "rust"]) {
      expect(semanticOutput(help(implementation, command), "--help")).toEqual(expected);
    }
  });
}

test("a missing subcommand fails even when its name remains in a description", () => {
  const original = help("ts", "root");

  const missing = original
    .replace(/^  setup .*\n/m, "")
    .replace("Join using", "Join after setup using");

  expect(semanticOutput(missing, "--help")).not.toEqual(semanticOutput(original, "--help"));
});

test("only declared option aliases count, and each missing alias fails", () => {
  const original =
    help("ts", "device") + "\nOutput:\n  -j, --json <file>  Write --verbose output\n";

  const expected = ["--json", "-j", "add", "ls", "rename", "rm"].sort();

  expect(semanticOutput(original, "--help")).toEqual(expected);

  for (const changed of [
    original.replace("-j, ", ""),
    original.replace(", --json", ""),
    original.replace(/^  -j, --json .*\n/m, ""),
  ]) {
    expect(semanticOutput(changed, "--help")).not.toEqual(expected);
  }
});

test("built-in help and version entries are ignored while the version command remains", () => {
  const original = help("ts", "root");

  const withoutBuiltins = original.replace(
    /^  (?:-V, --version|-h, --help|help \[command\]).*\n/gm,
    "",
  );

  expect(semanticOutput(original, "--help")).toEqual(semanticOutput(withoutBuiltins, "--help"));
  expect(semanticOutput(original, "--help")).toContain("version");
});

test("strict output still compares the captured help text", async () => {
  const c = new Context("/tmp/parity-help", {});
  c.results.push({ label: "--help", stdout: help("ts", "device"), stderr: "", code: 0 });
  const semantic = await capture(c, false);
  const strict = await capture(c, false, true);
  c.results[0]!.stdout = help("rust", "device");

  expect(await capture(c, false)).toBe(semantic);
  expect(await capture(c, false, true)).not.toBe(strict);
});
