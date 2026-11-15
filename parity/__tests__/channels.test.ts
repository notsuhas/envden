import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, mkdir, writeFile, chmod, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Normalizer } from "../normalize/normalizer.ts";
import { snapshot } from "../runtime/snapshot.ts";
import { differences } from "../runtime/diff.ts";

for (const channel of ["stdout", "stderr", "exit", "content", "mode", "db", "symlink"]) {
  test(`detects deliberate ${channel} mutation`, async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-channel-"));
    const a = join(root, "a");
    const b = join(root, "b");
    await mkdir(a);
    await mkdir(b);
    try {
      for (const path of [a, b]) {
        await writeFile(join(path, "fixture.env"), "TOKEN=literal\n", { mode: 0o600 });
        await symlink("fixture.env", join(path, "link"));
        const db = new Database(join(path, "server.sqlite"));
        db.run("CREATE TABLE evidence (id INTEGER, value TEXT, bytes BLOB)");
        db.run("INSERT INTO evidence VALUES (1, 'literal', x'1234')");
        db.close();
      }
      if (channel === "content") await writeFile(join(b, "fixture.env"), "TOKEN=tampered\n");
      if (channel === "mode") await chmod(join(b, "fixture.env"), 0o644);
      if (channel === "db") {
        const db = new Database(join(b, "server.sqlite"));
        db.run("UPDATE evidence SET value = 'tampered'");
        db.close();
      }
      if (channel === "symlink") await symlink("missing", join(b, "extra-link"));
      const left = {
        stdout: "version",
        stderr: "",
        exit: "0",
        ...(await snapshot(a, new Normalizer())),
      };
      const right = {
        stdout: channel === "stdout" ? "tampered" : "version",
        stderr: channel === "stderr" ? "tampered" : "",
        exit: channel === "exit" ? "4" : "0",
        ...(await snapshot(b, new Normalizer())),
      };
      const diff = await differences(left, right);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff.join("\n")).toContain("@@");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
