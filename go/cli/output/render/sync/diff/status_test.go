package diff

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/status"
)

func TestStatusText(t *testing.T) {
	checked := true
	p := Place{"/home/me/app", "/home/me"}
	r := status.Report{Configured: true, VaultID: "VAULT", Server: "reachable", ServerChecked: &checked, Files: []status.File{{Root: p.Cwd, Path: ".env", RepoID: "repo", State: "in-sync"}, {Root: p.Cwd, Path: "local.env", State: "local-only"}}}
	if got := StatusText(r, p); got != "In sync: 1 repo, 1 env file. Server reachable." {
		t.Fatal(got)
	}

	r.Files = []status.File{{Root: p.Cwd, Path: ".env", State: "diverged"}, {Root: "/home/me/api", Path: ".env", State: "changed"}, {Root: "/srv/web", Path: ".env", State: "remote"}, {Root: p.Cwd, Path: "a/.env", State: "conflict"}, {Root: p.Cwd, Path: "b/.env", State: "held-back", Reason: "checkout needs approval"}}
	want := "Server: reachable\nChanged here (run envden push): .env, ~/api/.env\nNewer on server (run envden pull): .env, /srv/web/.env\nConflicts (run envden resolve --list): a/.env\nHeld back: b/.env: checkout needs approval"
	if got := StatusText(r, p); got != want {
		t.Fatal(got)
	}

	r.Server = "unreachable"
	r.ServerReason = "connection refused"
	r.Files = nil
	want = "Server: unreachable (connection refused)\nNo changes here"
	if got := StatusText(r, p); got != want {
		t.Fatal(got)
	}
}
