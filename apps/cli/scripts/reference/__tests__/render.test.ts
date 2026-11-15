import { expect, test } from "bun:test";
import { renderReference } from "../render.ts";

test("renders a section with escaped, aligned tables", () => {
  const page = renderReference([
    {
      path: "envden vault",
      usage: "envden vault [options] [command]",
      description: "Manage the vault",
      subcommands: ["kit"],
      arguments: [],
      options: [],
    },
    {
      path: "envden config",
      usage: "envden config [options] [key]",
      description: "Set <key> to {json}.",
      subcommands: [],
      arguments: [{ term: "[key]", description: "Key", default: "all" }],
      options: [{ term: "--mode <m>", description: "link|copy" }],
    },
  ]);

  expect(page.slice(page.indexOf("## "))).toBe(`## envden vault

Manage the vault.

\`\`\`sh
envden vault [options] [command]
\`\`\`

Subcommands: [\`kit\`](#envden-vault-kit).

## envden config

Set \\<key\\> to \\{json\\}.

\`\`\`sh
envden config [options] [key]
\`\`\`

| Argument | Description | Default |
| -------- | ----------- | ------- |
| \`[key]\`  | Key         | all     |

| Option       | Description |
| ------------ | ----------- |
| \`--mode <m>\` | link\\|copy  |
`);
});
