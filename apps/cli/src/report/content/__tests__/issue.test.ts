import { expect, test } from "bun:test";
import { issueTitle, issueUrl } from "../issue.ts";

test("the title names the command and code", () => {
  expect(issueTitle(["--json", "status"], "INVALID_DATA")).toBe(
    "envden status fails with INVALID_DATA",
  );

  expect(issueTitle([], "TypeError")).toBe("envden fails with TypeError");
});

test("a short report is the whole body", () => {
  const url = new URL(issueUrl("T", "# Report\n\nbody & more"));

  expect(url.origin + url.pathname).toBe("https://github.com/notsuhas/envden/issues/new");
  expect(url.searchParams.get("title")).toBe("T");
  expect(url.searchParams.get("body")).toBe("# Report\n\nbody & more");
});

test("a long report is truncated so the link stays under 7000 characters", () => {
  const url = issueUrl("T", `start ${"é ".repeat(5000)}😀`);
  const body = new URL(url).searchParams.get("body")!;

  expect(url.length).toBeLessThanOrEqual(7000);
  expect(url.length).toBeGreaterThan(6900);
  expect(body.startsWith("start é")).toBe(true);
  expect(body).toEndWith("(Truncated. The full report is on the reporter's machine.)");
});
