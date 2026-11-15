import { expect, test } from "bun:test";
import { fileStatus, mostUrgent, pendingCount } from "../file-status.ts";

const clean = {
  localOnly: false,
  placement: "linked",
  conflict: false,
  heldBack: false,
  changed: false,
  remote: false,
} as const;

test.each([
  [{}, "in-sync"],
  [{ placement: "relinkable" }, "in-sync"],
  [{ changed: true }, "local-changes"],
  [{ remote: true }, "remote-changes"],
  [{ changed: true, remote: true }, "local-changes"],
  [{ placement: "missing" }, "missing"],
  [{ heldBack: true, changed: true }, "held-back"],
  [{ placement: "detached", heldBack: true }, "detached"],
  [{ conflict: true, placement: "detached" }, "conflict"],
  [{ localOnly: true, conflict: true }, "local-only"],
] as const)("%p is %s", (facts, status) => {
  expect(fileStatus({ ...clean, ...facts })).toBe(status);
});

test("pending counts everything not in sync or local only", () => {
  expect(pendingCount(["in-sync", "local-only", "conflict", "remote-changes"])).toBe(2);
});

test.each([
  [["in-sync", "local-only"], "in-sync"],
  [["local-only"], "local-only"],
  [["remote-changes", "local-changes"], "local-changes"],
  [["in-sync", "held-back", "missing"], "held-back"],
  [["detached", "conflict"], "conflict"],
] as const)("most urgent of %p is %s", (statuses, status) => {
  expect(mostUrgent([...statuses])).toBe(status);
});
