use super::issue::{NEW_ISSUE_URL, REPOSITORY};

pub fn agent_prompt(report: &str, logs: &[String]) -> String {
    let mut lines = vec![
        format!(
            "envden just failed with what looks like a bug in envden itself. envden is open source: https://github.com/{REPOSITORY}"
        ),
        String::new(),
        format!("A redacted report is at {report}."),
    ];
    if !logs.is_empty() {
        lines.push(format!("You may also read: {}.", logs.join(", ")));
    }
    lines.extend([
        String::new(),
        "1. Read the report and logs and work out the likely cause. Read envden's source if it helps.".into(),
        "2. Don't open key files or env files. Never copy env file contents, keys, tokens, passwords or recovery kit values into the issue.".into(),
        "3. Draft a short GitHub issue: title, what happened, steps to reproduce, envden version and OS, likely cause.".into(),
        format!("4. Show me the draft. Only after I agree, create it with `gh issue create --repo {REPOSITORY}`. If gh isn't installed or signed in, give me the text and this link: {NEW_ISSUE_URL}"),
    ]);
    lines.join("\n")
}
