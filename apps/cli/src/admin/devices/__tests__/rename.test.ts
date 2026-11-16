import { expect, spyOn, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { readIdentity } from "../../../identity/stored.ts";
import { loadState } from "../../../state/store/repository.ts";
import { pull } from "../../../sync/engine.ts";
import { reportRecoveryJoins } from "../../../notice/recovery.ts";
import { listDevices } from "../list.ts";
import { renameCheck, renameDevice } from "../rename.ts";

test("rename check rejects invalid and taken names and spots no-ops", () => {
  const own = { id: p.randomBytes(16), name: "laptop" };
  const other = { id: p.randomBytes(16), name: "desktop" };

  const devices = [own, other].map((d) => ({
    ...d,
    encPub: own.id,
    objPub: own.id,
    reqPub: own.id,
  }));

  for (const [name, expected] of [
    ["work", "rename"],
    ["laptop", "unchanged"],
    ["desktop", "taken"],
    ["", "invalid"],
    ["a".repeat(65), "invalid"],
    ["work​", "invalid"],
    ["work\nhome", "invalid"],
    ["work\t", "invalid"],
    ["\x1b[31mwork", "invalid"],
    ["work\x7f", "invalid"],
    ["work\u0085", "invalid"],
  ] as const)
    expect(renameCheck(devices, own.id, name)).toBe(expected);
});

test("a device renames itself and every device sees the new name", async () => {
  const f = await fixture(["second"]);
  const output = spyOn(console, "error").mockImplementation(() => {});

  try {
    const second = f.joined.second!;
    const rename = (name: string) => renameDevice(second, name, f.now, f.fetcher);

    for (const name of ["first", ""])
      await Promise.resolve(expect(rename(name)).rejects.toMatchObject({ code: "INVALID_INPUT" }));

    expect(await rename("second")).toEqual({ kind: "unchanged" });
    expect(await rename("laptop")).toEqual({ kind: "renamed" });

    const stored = await second.keychain.get(`envden/${second.home}/device`);
    expect(readIdentity(stored!).record.name).toBe("laptop");
    expect((await loadState(second.home))?.deviceName).toBe("laptop");

    await pull(f.first, { all: true, now: f.now, fetcher: f.fetcher });

    for (const home of [f.first, second])
      expect((await listDevices(home, f.now)).map((d) => d.name).sort()).toEqual([
        "first",
        "laptop",
      ]);

    const first = (await loadState(f.first.home))!;
    expect(first.deviceName).toBe("first");
    await reportRecoveryJoins(f.first.home, first, undefined, f.now);
    expect(output.mock.calls.flat()).toEqual([expect.stringContaining("laptop joined")]);
  } finally {
    output.mockRestore();
    await f.close();
  }
});
