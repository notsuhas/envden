import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { help } from "../compare/help.ts";

const fixture = (implementation: string, command: string) =>
  readFileSync(
    new URL(`./fixtures/help/${implementation}-${command}.txt`, import.meta.url),
    "utf8",
  );

for (const command of ["root", "device", "vault", "server", "setup", "join", "resolve"])
  test(`${command} help names match across the TS and Rust layouts`, () => {
    expect(help(fixture("rust", command))).toEqual(help(fixture("ts", command)));
  });

test("a missing subcommand or option alias still fails", () => {
  const device = fixture("ts", "device");

  expect(help(device.replace(/^ {2}add .*\n/m, ""))).not.toEqual(help(device));

  expect(help(fixture("ts", "setup").replace("--verbose", ""))).not.toEqual(
    help(fixture("ts", "setup")),
  );
});

test("built-in help entries are ignored, the version command is not", () => {
  const root = fixture("ts", "root");

  expect(help(root)).toEqual(
    help(root.replace(/^ {2}(?:-V, --version|-h, --help|help \[command\]).*\n/gm, "")),
  );

  expect(help(root)).toContain("command:version");
});
