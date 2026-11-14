import { expect, test } from "bun:test";
import { reclaimable } from "../owner.ts";

const identity = (host: string, boot: string, namespace = "pid:1") =>
  JSON.stringify({ host, boot, namespace });

test("lock reclamation separates hosts, boots and PID namespaces", () => {
  const previous = {
    pid: 123,
    token: "owner",
    startedAt: "first",
    identity: identity("host", "old"),
    createdAt: 0,
  };

  expect(reclaimable(previous, { kind: "unknown" }, identity("host", "new"), 3600000)).toBe(true);
  expect(reclaimable(previous, { kind: "dead" }, identity("other", "old"), 3600000)).toBe(false);

  expect(reclaimable(previous, { kind: "dead" }, identity("host", "old", "pid:2"), 3600000)).toBe(
    false,
  );

  expect(
    reclaimable(previous, { kind: "live", startedAt: "first" }, previous.identity, 3600000),
  ).toBe(false);

  expect(reclaimable(previous, { kind: "dead" }, previous.identity, 3600000)).toBe(true);
});
