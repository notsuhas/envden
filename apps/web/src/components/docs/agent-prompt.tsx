import { asMarkdown } from "fumadocs-core/server";
import { CodeBlock } from "fumadocs-ui/components/codeblock";
import { AGENT_PROMPT } from "@/lib/agent-prompt.ts";

export function AgentPrompt() {
  if (asMarkdown()) return `\n\`\`\`text\n${AGENT_PROMPT}\n\`\`\`\n`;

  return (
    <CodeBlock title="Prompt">
      <pre className="px-4 break-words whitespace-pre-wrap">{AGENT_PROMPT}</pre>
    </CodeBlock>
  );
}
