import { expect, test } from "bun:test";
import { detectHarnesses, launchCommand } from "../harness.ts";

test("finds installed agents in order and starts each with the prompt", () => {
  const installed: Record<string, string> = { gemini: "/bin/gemini", claude: "/bin/claude" };
  const harnesses = detectHarnesses((command) => installed[command] ?? null);

  expect(harnesses.map((harness) => harness.name)).toEqual(["Claude Code", "Gemini CLI"]);

  expect(harnesses.map((harness) => launchCommand(harness, "P"))).toEqual([
    ["/bin/claude", "P"],
    ["/bin/gemini", "-i", "P"],
  ]);

  expect(launchCommand({ id: "codex", name: "Codex", path: "/bin/codex" }, "P")).toEqual([
    "/bin/codex",
    "P",
  ]);
});
