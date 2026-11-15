package status

import (
	"testing"
)

func TestDeriveFileState(t *testing.T) {
	for _, r := range []struct {
		facts FileFacts
		want  string
	}{{FileFacts{Placement: "linked"}, "in-sync"}, {FileFacts{Placement: "relinkable"}, "in-sync"}, {FileFacts{Changed: true}, "changed"}, {FileFacts{Remote: true}, "remote"}, {FileFacts{Changed: true, Remote: true}, "diverged"}, {FileFacts{Placement: "missing"}, "missing"}, {FileFacts{Placement: "missing", Remote: true}, "remote"}, {FileFacts{HeldBack: true, Changed: true}, "held-back"}, {FileFacts{Placement: "detached", HeldBack: true}, "detached"}, {FileFacts{Conflict: true, HeldBack: true, Changed: true}, "conflict"}, {FileFacts{LocalOnly: true, Conflict: true}, "local-only"}} {
		if got := DeriveFileState(r.facts); got != r.want {
			t.Fatalf("%+v: %s != %s", r.facts, got, r.want)
		}
	}
}
