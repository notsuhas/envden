package enginetest

import (
	"github.com/notsuhas/envden/go/cli/sync/presentation"
	"regexp"
	"strings"
	"testing"
)

func TestConflictNoticeNamesCauseAndNextStep(t *testing.T) {
	notice := presentation.Notice{Path: "app/.env", File: "/c/ABC", Marked: true, Mine: "live", Theirs: "live"}
	keys := notice
	keys.Keys = []string{"TOKEN"}
	keys.Device = "laptop"
	if !regexp.MustCompile(`^Conflict in app/\.env: TOKEN .*laptop.*Edit /c/ABC.*envden resolve app/\.env$`).MatchString(presentation.ConflictNotice(keys)) {
		t.Fatal(presentation.ConflictNotice(keys))
	}
	if !strings.Contains(presentation.ConflictNotice(notice), "the server") {
		t.Fatal("missing default device")
	}
	notice.Marked = false
	notice.Mine = "deleted"
	deleted := presentation.ConflictNotice(notice)
	for _, part := range []string{"deleted here", "--keep-mine or --take-server"} {
		if !strings.Contains(deleted, part) {
			t.Fatal(deleted)
		}
	}
	equal(t, len(strings.Split(deleted, "\n")), 1)
}
