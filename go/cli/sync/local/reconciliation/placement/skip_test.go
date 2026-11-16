package placement

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/state/model"
)

func TestTargetSkip(t *testing.T) {
	target := model.Link{Root: "r", Path: ".env", Store: "s", Mode: "link"}

	for _, tc := range []struct {
		approved bool
		links    []model.Link
		want     string
	}{
		{false, nil, "unapproved"}, {false, []model.Link{target}, "unapproved"}, {true, nil, ""}, {true, []model.Link{target}, ""},
		{true, []model.Link{{Root: "r", Path: ".env", Store: "s", Mode: "copy", LocalOnly: true}}, "local-only"},
		{true, []model.Link{{Root: "r", Path: ".env", Store: "other", Mode: "link"}}, "changed"},
		{true, []model.Link{{Root: "r", Path: ".env", Store: "s", Mode: "copy"}}, "changed"},
	} {
		if got := TargetSkip(tc.links, target, tc.approved); got != tc.want {
			t.Fatal(tc, got)
		}
	}
}
