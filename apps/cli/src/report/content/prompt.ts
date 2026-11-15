import { NEW_ISSUE_URL, REPOSITORY } from "./issue.ts";

export function agentPrompt(report: string, logs: readonly string[]): string {
  return [
    `envden just failed with what looks like a bug in envden itself. envden is open source: https://github.com/${REPOSITORY}`,
    "",
    `A redacted report is at ${report}.`,
    ...(logs.length ? [`You may also read: ${logs.join(", ")}.`] : []),
    "",
    "1. Read the report and logs and work out the likely cause. Read envden's source if it helps.",
    "2. Don't open key files or env files. Never copy env file contents, keys, tokens, passwords or recovery kit values into the issue.",
    "3. Draft a short GitHub issue: title, what happened, steps to reproduce, envden version and OS, likely cause.",
    `4. Show me the draft. Only after I agree, create it with \`gh issue create --repo ${REPOSITORY}\`. If gh isn't installed or signed in, give me the text and this link: ${NEW_ISSUE_URL}`,
  ].join("\n");
}
