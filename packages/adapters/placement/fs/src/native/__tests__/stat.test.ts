import { expect, test } from "bun:test";
import { statSymbol } from "../stat.ts";

test("stat bindings prefer modern symbols and select the legacy architecture version", () => {
  expect(statSymbol(["fstatat", "__fxstatat"], "linux", "x64")).toEqual({ name: "fstatat" });
  expect(statSymbol(["__fxstatat"], "linux", "x64")).toEqual({ name: "__fxstatat", version: 1 });
  expect(statSymbol(["__fxstatat"], "linux", "arm64")).toEqual({ name: "__fxstatat", version: 0 });
  expect(statSymbol([], "linux", "x64")).toBeUndefined();
  expect(statSymbol(["__fxstatat"], "linux", "ia32")).toBeUndefined();
});
