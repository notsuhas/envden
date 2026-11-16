package push

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	fake "github.com/notsuhas/envden/go/testing/placement"
)

func TestOversizedUploadOnlyReportsPath(t *testing.T) {
	home := t.TempDir()
	root := filepath.Join(home, "oversized")
	store := filepath.Join(home, "store", "oversized")
	clock := func() int64 { return 1800000000000 }
	value := make([]byte, 1048577)
	if err := localfiles.WriteBytes(store, value, clock); err != nil {
		t.Fatal(err)
	}
	if err := localfiles.WriteBytes(filepath.Join(root, ".env.large"), value, clock); err != nil {
		t.Fatal(err)
	}

	s := state.EmptyState("test")
	s.Approved = append(s.Approved, state.Checkout{Root: root, GitDir: filepath.Join(root, ".git"), RepoID: "repo"})
	reports := []string{}
	a := contracts.Adapters{Home: home, Now: clock, Placement: func(mode adapters.PlacementMode, root string) adapters.Placement {
		return fake.CreateFakePlacementAdapter(fake.Operations{Mode: mode, Inspect: func(string, string) (adapters.PlacementState, error) { return adapters.PlacementLinked, nil }})
	}}
	sc := &syncmodel.Context{Context: context.Background(), Adapters: a, State: s, Checkpoint: chain.Checkpoint{IdKey: make([]byte, 32)}, Options: syncmodel.Options{Now: clock, Report: func(v string) { reports = append(reports, v) }}}
	files := manifests.Files{Entries: []manifests.FileEntry{}}
	order := []string{}
	if err := uploadLink(sc, map[string]bool{"repo": true}, state.Link{Root: root, Path: ".env.large", Store: store, Mode: "copy"}, &files, map[string]change{}, &order, map[string][]byte{}); err != nil {
		t.Fatal(err)
	}

	if len(files.Entries) != 0 || strings.Join(reports, "\n") != "Skipped oversized env file: .env.large exceeds 1 MiB" {
		t.Fatal(files, reports)
	}
}
