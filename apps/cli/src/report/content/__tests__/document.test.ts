import { expect, test } from "bun:test";
import { EnvdenError } from "@envden/core/errors";
import { reportDocument } from "../document.ts";
import { describeFailure } from "../failure.ts";

const facts = {
  version: "1.2.3",
  os: "darwin 25.6.0",
  arch: "arm64",
  install: "brew",
  args: ["config", "telemetry"],
  files: [
    { path: "/home/me/.envden/state/", exists: true },
    { path: "/home/me/.config/systemd/user/envden.service", exists: false },
  ],
  userHome: "/home/me",
};

test("an envden error lists its causes, a redacted log tail and file paths without contents", () => {
  const cause = new SyntaxError("JSON Parse error at /home/me/.envden/config.json");
  const failure = describeFailure(new EnvdenError("INVALID_DATA", "Unreadable config", { cause }));
  const log = ["old", ...Array.from({ length: 80 }, (_, line) => `line ${line}`), "SECRET=x"];

  const document = reportDocument({ ...facts, failure, serverLog: log.join("\n") + "\n" });

  expect(document).toContain("- Command: envden config telemetry");
  expect(document).toContain("- Code: INVALID_DATA\n- Message: Unreadable config");
  expect(document).toContain("- Caused by: JSON Parse error at ~/.envden/config.json");
  expect(document).toContain("~~~\nline 1\n");
  expect(document).toContain("SECRET=[redacted]\n~~~");
  expect(document).not.toContain("old");
  expect(document).not.toContain("line 0\n");

  expect(document).toContain(
    "- ~/.envden/state/\n- ~/.config/systemd/user/envden.service (missing)",
  );

  expect(document).not.toContain("/home/me");
});

test("a crash carries its stack and a missing log says so", () => {
  const document = reportDocument({
    ...facts,
    failure: describeFailure(new TypeError("boom")),
    serverLog: undefined,
  });

  expect(document).toContain("- Code: TypeError\n- Message: boom\n\n~~~\nTypeError: boom\n    at ");
  expect(document).toContain("No server log.");
});
