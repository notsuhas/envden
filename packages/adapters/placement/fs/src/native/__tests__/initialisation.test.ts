import { expect, test } from "bun:test";
import { loadFfi, loadLibc } from "../libc.ts";
import { requireNativePlacement } from "../required.ts";

test("only Windows may use placement without native support", () => {
  for (const platform of ["darwin", "linux"] as const)
    expect(() => requireNativePlacement(platform, undefined)).toThrow("Native placement");

  expect(() => requireNativePlacement("win32", undefined)).not.toThrow();
});

test("FFI import failure cannot enable the fallback on POSIX", async () => {
  const ffi = await loadFfi(() => Promise.reject(new Error("injected import failure")));
  expect(ffi).toBeUndefined();
  expect(() => requireNativePlacement("darwin", ffi)).toThrow("Native placement");
  expect(() => requireNativePlacement("linux", ffi)).toThrow("Native placement");
});

test("FFI binding failures cannot enable the fallback on POSIX", () => {
  const library = loadLibc(() => {
    throw new Error("injected binding failure");
  });

  expect(library).toBeUndefined();
  expect(() => requireNativePlacement("darwin", library)).toThrow("Native placement");
  expect(() => requireNativePlacement("linux", library)).toThrow("Native placement");
});
