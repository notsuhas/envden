import { test, expect } from "bun:test";
import { Normalizer } from "../harness/normalize.ts";
import { terminalScreen } from "../harness/terminal/screen.ts";

test("normalization preserves repeats, distinct identities and length", () => {
  const n = new Normalizer("/tmp/run");
  const first = "Z".repeat(52);
  const second = "Y".repeat(52);
  expect(n.text(`${first} ${second} ${first}`)).toBe("<token:1:52> <token:2:52> <token:1:52>");
  expect(n.text("/private/tmp/run/a 2026-01-01T00:00:00.000Z")).toBe("<ROOT>/a <TIME>");
  expect(n.text("TOKEN=one\n")).not.toBe(n.text("TOKEN=two\n"));
  expect(n.value(new Uint8Array(7))).not.toEqual(n.value(new Uint8Array(8)));
});

test("random object keys don't change how their values are classified", () => {
  const kinds = (key: string) =>
    Object.values(new Normalizer("/tmp/run").value({ [key]: "x".repeat(504) }) as object).map(
      (mapped) => String(mapped).split(":")[0],
    );

  expect(kinds(`${"A".repeat(49)}key`)).toEqual(kinds("A".repeat(52)));
});

test("terminal screen applies redraws while retaining messages", () => {
  expect(terminalScreen("ready\r\nworking\x1b[1G\x1b[Jdone\r\n")).toBe("ready\ndone\n");
  expect(terminalScreen("secret\r\n\x1b[1A\x1b[2Khidden\r\n")).toBe("hidden\n");
});

test("PTY waits for prompts and captures an exit", async () => {
  const { Terminal } = await import("../harness/process.ts");

  const terminal = new Terminal(
    [
      process.execPath,
      "-e",
      'process.stdout.write("Prompt:"); process.stdin.once("data", () => process.exit(0));',
    ],
    { PATH: process.env.PATH ?? "", TERM: "xterm" },
    import.meta.dir,
  );

  try {
    await terminal.expect("Prompt:", "answer\r");
    const result = await terminal.finish();
    expect(result.code).toBe(0);

    expect(result.prompts).toEqual([
      { question: "Prompt:", choices: [], selected: [], answer: "answer\r" },
    ]);
  } finally {
    terminal.close();
  }
});

test("snapshots retain plaintext, modes, symlink targets and database rows", async () => {
  const { mkdtemp, writeFile, chmod, symlink, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { Database } = await import("bun:sqlite");
  const { tree, database } = await import("../harness/snapshot.ts");
  const root = await mkdtemp(join(tmpdir(), "envden-parity-test-"));

  try {
    const env = join(root, ".env");
    await writeFile(env, "TOKEN=" + "A".repeat(64), { mode: 0o600 });
    await symlink(".env", join(root, "link"));
    const original = await tree(root, new Normalizer(root));
    await writeFile(env, "TOKEN=" + "B".repeat(64));
    expect(await tree(root, new Normalizer(root))).not.toEqual(original);
    await writeFile(env, "TOKEN=" + "A".repeat(64));
    await chmod(env, 0o644);
    expect(await tree(root, new Normalizer(root))).not.toEqual(original);
    expect(JSON.stringify(original)).toContain('"link":".env"');
    const path = join(root, "test.sqlite");
    const db = new Database(path);

    try {
      db.run("CREATE TABLE fixture(id INTEGER PRIMARY KEY, contents TEXT)");
      db.run("INSERT INTO fixture VALUES (1, 'first')");
      const first = database(path, new Normalizer(root));
      db.run("INSERT INTO fixture VALUES (2, 'second')");
      expect(database(path, new Normalizer(root))).not.toEqual(first);
    } finally {
      db.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("snapshots omit PowerShell runtime caches but retain adjacent user files", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { tree } = await import("../harness/snapshot.ts");
  const root = await mkdtemp(join(tmpdir(), "envden-parity-cache-"));

  try {
    const cache = join(root, ".cache", "powershell");
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, "runtime"), "first");
    await writeFile(join(root, ".cache", "user-file"), "keep");
    const original = await tree(root, new Normalizer(root));

    await writeFile(join(cache, "runtime"), "second");
    expect(await tree(root, new Normalizer(root))).toEqual(original);
    expect(JSON.stringify(original)).toContain("user-file");
    expect(JSON.stringify(original)).not.toContain("powershell");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
