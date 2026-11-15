import { expect, test } from "bun:test";
import { NEW_ISSUE_URL, REPOSITORY } from "../issue.ts";
import { agentPrompt } from "../prompt.ts";

test("the prompt names the report, the logs, the repo and the consent step", () => {
  const prompt = agentPrompt("/h/.envden/reports/r.md", [
    "/h/.envden/server.log",
    "/h/.envden/state/",
  ]);

  for (const part of [
    "/h/.envden/reports/r.md",
    "/h/.envden/server.log, /h/.envden/state/",
    "Never copy env file contents",
    `Only after I agree, create it with \`gh issue create --repo ${REPOSITORY}\``,
    NEW_ISSUE_URL,
  ])
    expect(prompt).toContain(part);

  expect(agentPrompt("/r.md", []).split("\n")).toHaveLength(prompt.split("\n").length - 1);
});
