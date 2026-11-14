import { expect, test } from "bun:test";
import { loadFfi, loadLibc } from "../libc.ts";

test("FFI and binding failures select the non-native fallback", async () => {
  expect(await loadFfi(() => Promise.reject(new Error("injected import failure")))).toBeUndefined();

  expect(
    loadLibc(() => {
      throw new Error("injected binding failure");
    }),
  ).toBeUndefined();
});
