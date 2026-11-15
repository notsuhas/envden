import { expect, test } from "bun:test";
import { EnvdenError } from "@envden/core/errors";
import { PromptCancelled } from "../../state/cancelled.ts";
import { deriveReportOffer } from "../offer.ts";

const crash = new TypeError("x is undefined");

test.each([
  ["a crash in a terminal", crash, true, {}, true],
  ["INVALID_DATA", new EnvdenError("INVALID_DATA", "Unreadable config"), true, {}, true],
  ["INTERNAL", new EnvdenError("INTERNAL", "Could not start"), true, {}, true],
  ["HEAD_MOVED", new EnvdenError("HEAD_MOVED", "Moved"), true, {}, true],
  ["no terminal", crash, false, {}, false],
  ["Claude Code", crash, true, { CLAUDECODE: "1" }, false],
  ["Claude Code SDK", crash, true, { CLAUDE_CODE_ENTRYPOINT: "sdk-ts" }, false],
  ["Codex", crash, true, { CODEX_SANDBOX: "seatbelt" }, false],
  ["Gemini CLI", crash, true, { GEMINI_CLI: "1" }, false],
  ["opted out", crash, true, { ENVDEN_NO_REPORT: "1" }, false],
  ["a cancelled prompt", new PromptCancelled(), true, {}, false],
  ["INVALID_INPUT", new EnvdenError("INVALID_INPUT", "Bad"), true, {}, false],
] as const)("%s offers %p", (_label, error, interactive, env, offered) => {
  expect(deriveReportOffer({ error, command: "setup", interactive, env })).toBe(offered);
});

test.each([
  ["a sync conflict from pull", "pull", "CONFLICT", false],
  ["a sync conflict from push", "push", "CONFLICT", false],
  ["a setup step that hit a CONFLICT", "setup", "CONFLICT", true],
  ["a wrong password", "unlock", "UNAUTHORIZED", false],
  ["not set up", "status", "NOT_FOUND", false],
  ["an unreachable server", "push", "SERVER_UNREACHABLE", false],
  ["a launchd failure during setup", "setup", "INTERNAL", true],
] as const)("%s offers %p", (_label, command, code, offered) => {
  const error = new EnvdenError(code, "x");

  expect(deriveReportOffer({ error, command, interactive: true, env: {} })).toBe(offered);
});
