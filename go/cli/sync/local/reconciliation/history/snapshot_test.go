package history

import (
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
	fake "github.com/notsuhas/envden/go/testing/placement"
)

func TestTargetSnapshots(t *testing.T) {
	for _, mode := range []string{"link", "copy"} {
		for _, status := range []adapters.PlacementState{adapters.PlacementLinked, adapters.PlacementDetached, adapters.PlacementMissing} {
			home, root := t.TempDir(), t.TempDir()
			clock := func() int64 { return 1700000000000 }
			store := filepath.Join(home, "store", ".env")
			item := model.Link{Root: root, Path: ".env", Store: store, Mode: mode}
			if err := f.WriteBytes(filepath.Join(root, ".env"), []byte("local"), clock); err != nil {
				t.Fatal(err)
			}
			rootBase := ""
			if mode == "copy" {
				rootBase = root
			}
			if err := f.WriteBytes(f.BasePath(home, store, rootBase), []byte("previous"), clock); err != nil {
				t.Fatal(err)
			}
			placement := fake.CreateFakePlacementAdapter(fake.Operations{Inspect: func(string, string) (adapters.PlacementState, error) { return status, nil }})
			state := model.EmptyState("fixture")
			state.Links = []model.Link{item}
			sc := &sm.Context{Adapters: contracts.Adapters{Home: home, Placement: func(adapters.PlacementMode, string) adapters.Placement { return placement }}, State: state}
			snapshot, err := FileSnapshot(sc, item, []byte("store"), nil)
			if err != nil {
				t.Fatal(err)
			}
			useStore := mode == "link" && status != "detached"
			want := "local"
			if useStore {
				want = "store"
			}
			if !snapshot.Tracked || snapshot.UseStore != useStore || string(snapshot.Bytes) != want || string(snapshot.Base) != "previous" || snapshot.Detached != (mode == "link" && status == "detached") {
				t.Fatal(mode, status, snapshot)
			}
		}
	}
}
