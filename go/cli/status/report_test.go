package status

import (
	"context"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	fake "github.com/notsuhas/envden/go/testing/placement"
)

func TestOfflineStatusPreservesLocalChanges(t *testing.T) {
	home := t.TempDir()
	now := func() int64 { return 1800000000000 }
	timing := lock.Timing{Now: now, Delays: []int64{}}
	s := model.EmptyState("test")
	s.Server = &model.Server{Address: "http://unused", Pin: "", Protocol: 1}
	s.VaultID = "VAULT"
	s.Approved = []model.Checkout{{Root: "/repo", RepoID: "repo", GitDir: "/repo/.git"}}
	s.Links = []model.Link{{Root: "/repo", Path: ".env", Mode: "link", Store: filepath.Join(home, "store", "env")}}
	if e := store.SaveState(context.Background(), home, s, timing); e != nil {
		t.Fatal(e)
	}

	a := contracts.Adapters{Home: home, Now: now, Timing: timing, Fetcher: func(*http.Request) (*http.Response, error) {
		return nil, errors.New(errors.ServerUnreachable, "offline")
	}, Placement: func(adapters.PlacementMode, string) adapters.Placement {
		return fake.CreateFakePlacementAdapter(fake.Operations{Inspect: func(string, string) (adapters.PlacementState, error) { return adapters.PlacementLinked, nil }})
	}}
	sources := Sources{Changes: func(context.Context, contracts.Adapters) ([]Change, error) {
		return []Change{{Root: "/repo", Path: ".env", Kind: "diff", Differs: true, Keys: Keys{Added: []string{"NEW_KEY"}, Removed: []string{}, Changed: []string{}}}}, nil
	}, Remote: func(context.Context, contracts.Adapters) ([]RemoteFile, error) {
		t.Fatal("offline remote queried")

		return nil, nil
	}}
	r, e := StatusReport(context.Background(), a, sources)
	if e != nil || !r.Configured || r.Server != "unreachable" || len(r.Files) != 1 || r.Files[0].State != "changed" {
		t.Fatal(r, e)
	}

	if r.ServerChecked == nil || *r.ServerChecked {
		t.Fatal(r.ServerChecked)
	}

	raw, e := jsonvalue.Marshal(Report{})
	if e != nil || string(raw) != `{"configured":false,"update":{"available":false,"required":false}}` {
		t.Fatal(string(raw), e)
	}
}
