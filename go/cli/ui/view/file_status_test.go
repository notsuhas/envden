package view

import "testing"

func TestFileStatus(t *testing.T) {
	for _, row := range []struct {
		facts FileFacts
		want  string
	}{
		{FileFacts{Placement: "linked"}, "in-sync"}, {FileFacts{Placement: "relinkable"}, "in-sync"}, {FileFacts{Changed: true}, "local-changes"}, {FileFacts{Remote: true}, "remote-changes"}, {FileFacts{Changed: true, Remote: true}, "local-changes"}, {FileFacts{Placement: "missing"}, "missing"}, {FileFacts{HeldBack: true, Changed: true}, "held-back"}, {FileFacts{Placement: "detached", HeldBack: true}, "detached"}, {FileFacts{Conflict: true, Placement: "detached"}, "conflict"}, {FileFacts{LocalOnly: true, Conflict: true}, "local-only"},
	} {
		if got := FileStatus(row.facts); got != row.want {
			t.Fatalf("%+v got %q", row.facts, got)
		}
	}
	if PendingCount([]string{"in-sync", "local-only", "conflict", "remote-changes"}) != 2 {
		t.Fatal("pending")
	}
	if MostUrgent([]string{"local-only"}) != "local-only" || MostUrgent([]string{"detached", "conflict"}) != "conflict" {
		t.Fatal("urgency")
	}
	if SyncSummary("pull", 2, 1) != "Pulled: 2 changed, 1 conflict." || SyncSummary("push", 0, 0) != "Pushed: 0 changed, 0 conflicts." {
		t.Fatal("summary")
	}
}
