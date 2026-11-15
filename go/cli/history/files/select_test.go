package files

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
)

func TestHistoryTargets(t *testing.T) {
	s := model.EmptyState("device")
	s.Approved = []model.Checkout{{Root: "/work/app", RepoID: "example/app"}, {Root: "/work/app-feature", RepoID: "example/app"}, {Root: "/work/other", RepoID: "example/fork"}}
	s.Aliases = jsonvalue.Object{{Key: "example/fork", Value: "example/app"}}
	s.Links = []model.Link{{Root: "/work/app", Path: ".env"}, {Root: "/work/app", Path: "api/.env.local"}, {Root: "/work/app-feature", Path: ".env"}, {Root: "/work/app", Path: ".env.test", LocalOnly: true}}
	repos := map[string]bool{"example/app": true}
	ts, err := HistoryTargets(s, repos, Selection{Cwd: "/work/app/api"})
	if err != nil || len(ts) != 2 || ts[0].Path != ".env" || ts[1].Path != "api/.env.local" {
		t.Fatal(ts, err)
	}

	ts, err = HistoryTargets(s, repos, Selection{Cwd: "/", All: true})
	if err != nil || len(ts) != 3 {
		t.Fatal(ts, err)
	}

	file := "../app/.env.test"
	ts, err = HistoryTargets(s, repos, Selection{Cwd: "/work/app-feature", File: &file})
	if err != nil || len(ts) != 1 || ts[0].Link != &s.Links[3] {
		t.Fatal(ts, err)
	}

	file = ".env.gone"
	ts, err = HistoryTargets(s, repos, Selection{Cwd: "/work/other", File: &file})
	if err != nil || ts[0].RepoID != "example/app" || ts[0].Link != nil {
		t.Fatal(ts, err)
	}

	for _, c := range []struct {
		file string
		code errors.Code
	}{{"/elsewhere/.env", errors.NotFound}, {"/work/app", errors.InvalidInput}} {
		_, err = HistoryTargets(s, repos, Selection{Cwd: "/work/app", File: &c.file})
		if !errors.Is(err, c.code) {
			t.Fatal(c, err)
		}
	}

	file = "/work/app/api/.env"
	if got := SelectionDirectory(Selection{Cwd: "/", File: &file}); got != "/work/app/api" {
		t.Fatal(got)
	}
}
