import { test, expect, spyOn } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportReplacementKit } from "../output.ts";

test("replacement kit stays private on success and is recoverable after a write failure", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-kit-"));
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});

  try {
    const path = join(home, "kit.json");
    await reportReplacementKit({ secretKey: "first" }, path);
    expect(log).not.toHaveBeenCalled();
    await reportReplacementKit({ secretKey: "replacement" }, path);
    expect(await readFile(path, "utf8")).toContain("first");
    expect(log.mock.calls.flat().join("")).toContain("replacement");
    expect(error.mock.calls.flat().join("")).not.toContain("replacement");
  } finally {
    log.mockRestore();
    error.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

for (const existing of [false, true])
  test(`kit replacement reports safely after commit with kit-out: ${existing}`, async () => {
    const { fixture } = await import("../../../admin/recovery/__tests__/fixture.ts");
    const { runVaultAdmin } = await import("../run.ts");
    const f = await fixture();
    const log = spyOn(console, "log").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});

    try {
      const path = join(f.first.home, "kit.json");
      if (existing) await Bun.write(path, "original");
      await runVaultAdmin(f.first, "replace", f.now, async () => "old password", path);

      if (existing) {
        expect(await readFile(path, "utf8")).toBe("original");
        expect(JSON.parse(String(log.mock.calls[0]?.[0])).secretKey).toBeString();
      } else {
        const { secretKey } = JSON.parse(await readFile(path, "utf8"));
        expect(secretKey).toBeString();
        expect(log.mock.calls.flat().join("")).not.toContain(secretKey);
      }
    } finally {
      log.mockRestore();
      error.mockRestore();
      await f.close();
    }
  });
