package guidance

func HeldGuidance(held string) string {
	return map[string]string{"invalid-state": "invalid sync state; press Pull, then settle any conflict above", "oversized": "file exceeds 1 MiB; reduce its size before pushing", "needs-approval": "checkout needs approval; run envden track in a terminal", "excluded": "excluded by env-files; change them with envden config in a terminal", "conflict": "choose a side in Conflicts", "lost": "content was lost outside envden; restore a version from History", "incomplete": "placement incomplete; press Pull"}[held]
}
