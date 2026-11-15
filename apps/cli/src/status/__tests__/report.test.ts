import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { pull, push } from "../../sync/engine.ts";
import { syncFixture } from "../../sync/__tests__/flows.ts";
import { statusReport } from "../report.ts";

test("status reports local edits, newer server changes and the in-sync state", async () => {
  const f = await syncFixture();

  try {
    const first = await statusReport(f.first);

    expect(first).toMatchObject({ server: "reachable", serverChecked: true });
    expect(first.configured && first.files.map((file) => file.state)).toEqual(["in-sync"]);

    await writeFile(f.aStore, "TOKEN=local-test-value\nNEW_KEY=x\n");

    expect(await statusReport(f.first)).toMatchObject({
      files: [{ path: ".env", state: "changed", keys: { added: ["NEW_KEY"] } }],
    });

    expect(await statusReport(f.second)).toMatchObject({
      files: [{ root: f.checkoutB.root, path: ".env", state: "remote" }],
    });

    await push(f.first, f.opts);

    expect(await statusReport(f.first)).toMatchObject({ files: [{ state: "in-sync" }] });
    expect(await statusReport(f.second)).toMatchObject({ files: [{ state: "remote" }] });

    await pull(f.second, f.opts);

    expect(await statusReport(f.second)).toMatchObject({ files: [{ state: "in-sync" }] });
  } finally {
    await f.cleanup();
  }
});
