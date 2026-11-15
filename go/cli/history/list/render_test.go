package list

import (
	"strings"
	"testing"
)

func TestHistoryText(t *testing.T) {
	version := uint64(3)
	r := Result{Files: []File{{RepoID: "example/repo", Path: ".env", Pruned: true, Checkouts: []Checkout{{Root: "/work", Version: &version}, {Root: "/work-feature"}}, Versions: []Version{{Version: 3, Kind: "restored", Device: "laptop\x1b", Changes: KeyChanges{Added: []string{"TOKEN"}}}, {Version: 2, Kind: "lost", RemovedDevice: true, Changes: "unknown"}}}}}
	got := HistoryText(r, 0, "")
	for _, want := range []string{"example/repo .env", "v3", "restored by a server repair; added TOKEN", "<- current in /work", "removed device", "lost in a server repair", "older versions pruned", "/work-feature matches no retained version"} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in %q", want, got)
		}
	}

	if strings.Contains(got, "\x1b") {
		t.Fatal("terminal escape was not sanitized")
	}

	if got := HistoryText(Result{}, 0, ""); got != "No env files to show" {
		t.Fatal(got)
	}
}
