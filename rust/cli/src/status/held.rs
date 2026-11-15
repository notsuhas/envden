pub fn held_reason(kind: &str) -> &'static str {
    match kind {
        "invalid-state" => "invalid sync state; run envden pull, then envden resolve --list",
        "oversized" => "file exceeds 1 MiB; reduce its size before pushing",
        "needs-approval" => "checkout needs approval; run envden track",
        "excluded" => "excluded by env-files; update envden config env-files",
        "conflict" => "conflict; run envden resolve --list",
        "lost" => "content was lost outside envden; restore from backup or untrack",
        _ => "placement incomplete; run envden pull",
    }
}
