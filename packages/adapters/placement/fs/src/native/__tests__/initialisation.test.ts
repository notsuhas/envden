import { expect, test } from "bun:test";
import { loadFfi, loadLibc } from "../libc.ts";
import { requireNativePlacement } from "../required.ts";

test("only Windows may use placement without native support", () => {
  for (const platform of ["darwin", "linux"] as const)
    expect(() => requireNativePlacement(platform, undefined)).toThrow("Native placement");

  expect(() => requireNativePlacement("win32", undefined)).not.toThrow();
});

test("FFI import and binding failures cannot enable the POSIX fallback", async () => {
  const unavailable = [
    await loadFfi(() => Promise.reject(new Error("injected import failure"))),
    loadLibc(() => {
      throw new Error("injected binding failure");
    }),
  ];

  for (const library of unavailable) {
    expect(library).toBeUndefined();

    for (const platform of ["darwin", "linux"] as const)
      expect(() => requireNativePlacement(platform, library)).toThrow("Native placement");
  }
});
