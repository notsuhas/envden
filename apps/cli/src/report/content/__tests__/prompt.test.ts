import { expect, test } from "bun:test";
import { agentPrompt } from "../prompt.ts";

test("the prompt names the report, the logs, the repo and the consent step", () => {
  const prompt = agentPrompt("/h/.envden/reports/r.md", [
    "/h/.envden/server.log",
    "/h/.envden/state/",
  ]);

  expect(prompt).toContain("A redacted report is at /h/.envden/reports/r.md.");
  expect(prompt).toContain("You may also read: /h/.envden/server.log, /h/.envden/state/.");
  expect(prompt).toContain("https://github.com/notsuhas/envden");

  expect(prompt).toContain(
    "Never copy env file contents, keys, tokens, passwords or recovery kit values",
  );

  expect(prompt).toContain(
    "Only after I agree, create it with `gh issue create --repo notsuhas/envden`",
  );

  expect(prompt).toContain("https://github.com/notsuhas/envden/issues/new");
  expect(agentPrompt("/r.md", [])).not.toContain("You may also read");
});
