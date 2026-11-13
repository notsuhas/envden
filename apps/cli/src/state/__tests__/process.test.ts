import { expect, test } from "bun:test";
import { linuxStart, processStart } from "../lock/process.ts";
import { reclaimable } from "../lock/owner.ts";

test("Linux starttime handles spaces and parentheses in process names", () => {
  const fields = ["S", ...Array.from({ length: 18 }, () => "0"), "123456", "0"];
  expect(linuxStart(`123 (name ) with spaces) ${fields.join(" ")}`)).toBe("123456");
  expect(linuxStart("bad stat")).toBeUndefined();
});

test("process identity is observable without GNU ps", async () => {
  const identity = await processStart(process.pid);
  expect(identity).toMatchObject({ kind: "live" });
  expect(await processStart(process.pid)).toEqual(identity);
  expect(await processStart(2147483647)).toEqual({ kind: "dead" });
});

test("only proven death or a different observed start permits reclaim", () => {
  const previous = { pid: 123, token: "owner", startedAt: "first" };
  expect(reclaimable(previous, { kind: "unknown" })).toBe(false);
  expect(reclaimable(previous, { kind: "live", startedAt: "first" })).toBe(false);
  expect(reclaimable(previous, { kind: "live", startedAt: "second" })).toBe(true);
  expect(reclaimable(previous, { kind: "dead" })).toBe(true);

  expect(reclaimable({ pid: 123, token: "legacy" }, { kind: "live", startedAt: "first" })).toBe(
    false,
  );
});

test("Linux reads proc starttime even when ps is unavailable", async () => {
  const fields = ["S", ...Array.from({ length: 18 }, () => "0"), "987654", "0"];

  const result = await processStart(123, "linux", async (path) => {
    expect(path).toBe("/proc/123/stat");

    return `123 (busybox process) ${fields.join(" ")}`;
  });

  expect(result).toEqual({ kind: "live", startedAt: "987654" });

  expect(
    await processStart(process.pid, "linux", async () => {
      throw new Error("denied");
    }),
  ).toEqual({ kind: "unknown" });
});
