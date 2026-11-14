import * as trusted from "@envden/core/process";
import { processIdentity } from "../process.ts";
import { expect, test, spyOn } from "bun:test";
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

test("boot discovery is cached for the lifetime of the process", async () => {
  const identity = await processIdentity();
  expect(identity).toBeDefined();
  const probe = spyOn(trusted, "execTrusted");

  try {
    expect(await processIdentity()).toBe(identity);
    expect(probe).not.toHaveBeenCalled();
  } finally {
    probe.mockRestore();
  }
});
