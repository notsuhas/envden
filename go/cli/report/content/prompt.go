package content

import "strings"

func AgentPrompt(report string, logs []string) string {
	lines := []string{"envden just failed with what looks like a bug in envden itself. envden is open source: https://github.com/" + Repository, "", "A redacted report is at " + report + "."}
	if len(logs) > 0 {
		lines = append(lines, "You may also read: "+strings.Join(logs, ", ")+".")
	}
	lines = append(lines, "", "1. Read the report and logs and work out the likely cause. Read envden's source if it helps.", "2. Don't open key files or env files. Never copy env file contents, keys, tokens, passwords or recovery kit values into the issue.", "3. Draft a short GitHub issue: title, what happened, steps to reproduce, envden version and OS, likely cause.", "4. Show me the draft. Only after I agree, create it with `gh issue create --repo "+Repository+"`. If gh isn't installed or signed in, give me the text and this link: "+NewIssueURL)
	return strings.Join(lines, "\n")
}
