package view

import (
	"slices"
)

type FileFacts struct {
	LocalOnly                           bool
	Placement                           string
	Conflict, HeldBack, Changed, Remote bool
}

func FileStatus(f FileFacts) string {
	switch {
	case f.LocalOnly:
		return "local-only"
	case f.Conflict:
		return "conflict"
	case f.Placement == "detached":
		return "detached"
	case f.HeldBack:
		return "held-back"
	case f.Placement == "missing":
		return "missing"
	case f.Changed:
		return "local-changes"
	case f.Remote:
		return "remote-changes"
	default:
		return "in-sync"
	}
}

func PendingCount(statuses []string) int {
	count := 0
	for _, s := range statuses {
		if s != "in-sync" && s != "local-only" {
			count++
		}
	}

	return count
}

func MostUrgent(statuses []string) string {
	for _, s := range []string{"conflict", "detached", "held-back", "missing", "local-changes", "remote-changes", "in-sync", "local-only"} {
		if slices.Contains(statuses, s) {
			return s
		}
	}

	return "in-sync"
}
