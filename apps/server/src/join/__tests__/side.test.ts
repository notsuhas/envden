import { expect, test } from "bun:test";
import { joinSide, type TJoinAction, type TJoinRole } from "../side.ts";

const roles: TJoinRole[] = ["joiner", "claimer", "member", "other"];

const allowed = (action: TJoinAction, claimed: boolean) =>
  roles.filter((role) => joinSide(role, action, claimed).kind === "allowed");

test("each side of a join request reads and writes only its own slots", () => {
  expect(allowed({ kind: "write", slot: "offer" }, false)).toEqual(["claimer", "member"]);
  expect(allowed({ kind: "write", slot: "offer" }, true)).toEqual(["claimer"]);
  expect(allowed({ kind: "read", slot: "offer" }, true)).toEqual(["joiner"]);
  expect(allowed({ kind: "write", slot: "reveal" }, true)).toEqual(["joiner"]);
  expect(allowed({ kind: "read", slot: "reveal" }, true)).toEqual(["claimer"]);
  expect(allowed({ kind: "close" }, true)).toEqual(["joiner", "claimer"]);
});
