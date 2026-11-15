package status

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/ui/view/unlock"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/merge"
	placementfake "github.com/notsuhas/envden/go/testing/placement"
	repofake "github.com/notsuhas/envden/go/testing/repo"
	"path/filepath"
	"strings"
	"testing"
)

func TestNotConfiguredDoesNotProbe(t *testing.T) {
	value, err := DashboardStatus(context.Background(), contracts.Adapters{Home: t.TempDir()}, Sources{})
	raw, _ := jsonvalue.Marshal(value)
	if err != nil || string(raw) != `{"kind":"not-configured"}` {
		t.Fatal(string(raw), err)
	}
}

func TestStatusReportsKeysWithoutValues(t *testing.T) {
	ctx := context.Background()
	home := t.TempDir()
	root := filepath.Join(home, "checkout")
	now := func() int64 { return 100 }
	timing := lock.Timing{Now: now}
	state := model.EmptyState("device")
	state.Server = &model.Server{Address: "http://local"}
	state.VaultID = "abcdefgh1234"
	state.Approved = []model.Checkout{{Root: root, GitDir: root + "/.git", RepoID: "host/repo"}}
	state.Links = []model.Link{{Root: root, Path: ".env", Store: filepath.Join(home, "store"), Mode: "link"}}
	if err := store.SaveState(ctx, home, state, timing); err != nil {
		t.Fatal(err)
	}
	a := contracts.Adapters{Home: home, Now: now, Timing: timing, Repo: repofake.CreateFakeRepoAdapter(repofake.Operations{CheckoutAt: func(string) (*adapters.Checkout, error) {
		return &adapters.Checkout{Root: root, GitDir: root + "/.git", RepoID: "host/repo"}, nil
	}}), Placement: func(adapters.PlacementMode, string) adapters.Placement {
		return placementfake.CreateFakePlacementAdapter(placementfake.Operations{Inspect: func(string, string) (adapters.PlacementState, error) { return adapters.PlacementLinked, nil }})
	}}
	sources := Sources{Diff: func(context.Context) ([]Change, error) {
		return []Change{{Root: root, Path: ".env", Differs: true, Result: merge.Result{Kind: "diff", Added: []string{"NEW"}, Bytes: []byte("SECRET=never-report-me")}}}, nil
	}, HeldBack: func(context.Context) ([]Held, error) { return []Held{}, nil }, Remote: func(context.Context) ([]string, error) { return []string{}, nil }, Reachability: func(context.Context) (string, error) { return "reachable", nil }, Probe: func(context.Context) unlock.Probe { return unlock.Probe{Kind: "unlocked"} }}
	value, err := DashboardStatus(ctx, a, sources)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := jsonvalue.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if strings.Contains(text, "never-report-me") || !strings.Contains(text, `"keys":{"kind":"diff","added":["NEW"],"removed":[],"changed":[]}`) || !strings.Contains(text, `"pending":1`) || !strings.Contains(text, `"vaultId":"abcdefgh"`) {
		t.Fatal(text)
	}
}
