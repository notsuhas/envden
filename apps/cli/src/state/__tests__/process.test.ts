import { expect, test } from "bun:test";
import { linuxStart, processStart } from "../lock/process.ts";

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
