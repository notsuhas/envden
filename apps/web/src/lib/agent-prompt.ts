import { SITE_URL } from "@/lib/site.ts";

export const AGENT_PROMPT = `Set up envden on this machine. Read the docs first: ${SITE_URL}/llms-full.txt

Rules:
- If envden isn't installed, stop and tell me. Don't install it from a source the docs don't list.
- Run \`envden doctor --json\` and \`envden status --json\` before changing anything.
- Pass a flag for every choice. If envden stops and lists flags it needs, ask me for those choices. Don't guess.
- Never ask me for the recovery code, never type it, and never answer whether join words match. When envden says a step needs me, give me the exact command to run in my own terminal, then wait.
- Approving a checkout is my decision. Don't try to skip it.
- Don't resolve conflicts for me. Tell me which files conflict and stop.
- \`envden update --check\` is fine. Ask before running \`envden update\`.
- Run \`envden agent install\` so the envden skill is available next time.

When you finish, show me \`envden status --json\` and list what's left for me to do.`;
