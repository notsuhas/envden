import { test, expect } from "bun:test";
import { validatePulledPath } from "../index.ts";

for (const path of [
  ".g\u200cit/config",
  "nested/\u200d.env",
  ".git/config",
  ".GIT/x",
  "GIT~1/.env",
  "nested/ENV~2",
  ".env~1",
])
  test(`reject ${JSON.stringify(path)}`, () => expect(() => validatePulledPath(path)).toThrow());

test("local paths retain Unicode format characters", async () => {
  const { checkoutRelative } = await import("../paths/checkout-relative.ts");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  for (const name of ["with\u200djoiner", "soft\u00adhyphen"]) {
    expect(checkoutRelative(tmpdir(), join(tmpdir(), name, ".env"))).toBe(name + "/.env");
  }
});

test("existing local Unicode copies can be inspected and removed", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { createFsPlacementAdapter } = await import("../adapter.ts");
  const root = await mkdtemp(join(tmpdir(), "envden-unicode-"));

  try {
    const folder = join(root, "with\u200djoiner");
    const local = join(folder, ".env");
    const store = join(root, "store");
    await mkdir(folder);
    await writeFile(store, "same");
    await writeFile(local, "same");
    const adapter = createFsPlacementAdapter("copy", root);
    expect(await adapter.inspect(store, local)).toBe("linked");
    await adapter.remove(store, local);
    expect(await adapter.inspect(store, local)).toBe("missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
