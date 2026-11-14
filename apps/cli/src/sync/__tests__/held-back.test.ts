import { rm, mkdir } from "node:fs/promises";
import { expect, test } from "bun:test";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { heldBackFiles } from "../local/lineage/held-back.ts";
import { push } from "../engine.ts";

const fixture = createSharedFixture();

for (const failure of ["placement", "conflict", "inspection"] as const)
  test(`push and status report the same ${failure} reason`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, ["copy", "copy"]);

    if (failure === "conflict") await atomicWrite(join(targets[0]!.root, ".env"), "TOKEN=mine\n");
    else if (failure === "inspection") {
      const path = join(targets[0]!.root, ".env");
      await rm(path);
      await mkdir(path);
    } else {
      const original = f.second.repo.ensureIgnored.bind(f.second.repo);

      f.second.repo.ensureIgnored = async (checkout, path) => {
        if (checkout.root === targets[1]!.root) throw new Error("Placement failed");
        await original(checkout, path);
      };
    }

    await atomicWrite(f.aStore, "TOKEN=server\n");
    await push(f.first, f.opts);
    const result = await push(f.second, f.opts);
    const notices = await heldBackFiles(f.second);
    expect(notices.length).toBeGreaterThan(0);

    for (const notice of notices)
      expect(result.reports).toContain(`Held back ${notice.path}: ${notice.reason}`);
  });
