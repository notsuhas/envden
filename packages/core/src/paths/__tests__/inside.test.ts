import { expect, test } from "bun:test";
import { posix, win32 } from "node:path";
import { placeInRoot } from "../inside.ts";

for (const [api, root, target, expected] of [
  [posix, "/repos", "/repos", "root"],
  [posix, "/repos", "/repos/", "root"],
  [posix, "/repos", "/repos/a", "inside"],
  [posix, "/repos", "/repos/a/b", "inside"],
  [posix, "/repos", "/repos/..cache", "inside"],
  [posix, "/repos", "/repos/a/../b", "inside"],
  [posix, "/repos", "/", "outside"],
  [posix, "/repos", "/repos-other", "outside"],
  [posix, "/repos", "/repos/../x", "outside"],
  [posix, "/repos", "/elsewhere", "outside"],
  [win32, "C:\\repos", "C:\\repos", "root"],
  [win32, "C:\\repos", "c:/repos/a", "inside"],
  [win32, "C:\\repos", "C:\\repos\\..cache", "inside"],
  [win32, "C:\\repos", "C:\\", "outside"],
  [win32, "C:\\repos", "C:\\repos\\..\\x", "outside"],
  [win32, "C:\\repos", "D:\\repos\\a", "outside"],
  [win32, "C:\\repos", "\\\\server\\share\\repos", "outside"],
] as const)
  test(`${root} holds ${target} as ${expected}`, () => {
    expect(placeInRoot(root, target, api)).toBe(expected);
  });
