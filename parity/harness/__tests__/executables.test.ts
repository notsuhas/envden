import { expect, test } from "bun:test";
import { executablePaths } from "../executables.ts";
import { Normalizer } from "../normalize.ts";

test("a wrapper and the delegated reference executable share a placeholder", () => {
  const paths = executablePaths({ server: ["/tmp/wrapper"] }, [
    "--impl",
    "ts=/tmp/reference",
    "--impl",
    "hybrid=/tmp/wrapper",
  ]);

  const n = new Normalizer("/tmp/scenario", paths);
  expect(n.text("exec /tmp/reference")).toBe("exec <EXECUTABLE>");
  expect(n.text("exec /tmp/wrapper")).toBe("exec <EXECUTABLE>");
});

test("history timestamp padding is independent of elapsed time width", () => {
  const n = new Normalizer("/tmp/scenario");

  expect(n.text("v1  2 seconds ago (2026-11-16 12:00 GMT+5:30)  alpha")).toBe(
    n.text("v1  12 seconds ago (2026-11-16 12:00 GMT+5:30)   alpha"),
  );
});
