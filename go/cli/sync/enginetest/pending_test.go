package enginetest

import (
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"os"
	"path/filepath"
	"testing"
)

func TestFailedPlacementResumesNewerContent(t *testing.T) {
	for _, edit := range []string{"target", "store", "none"} {
		t.Run(edit, func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout("copy", "copy", "link")
			store := targets[0].Store
			f.write(f.aStore, "TOKEN=remote\n")
			f.push(f.first)
			restore := failPlacement(f, &f.second, targets[1].Root, false)
			equal(t, f.pull(f.second).Conflicts, 1)
			_, err := os.Stat(files.BasePath(f.second.Home, store) + ".pending")
			must(t, err)
			path := filepath.Join(targets[0].Root, ".env")
			if edit == "store" {
				path = store
			}
			if edit != "none" {
				f.write(path, "TOKEN=later\n")
			}
			restore()
			f.pull(f.second)
			if edit == "none" {
				equal(t, f.read(store), "TOKEN=remote\n")
				records, err := local.ConflictRecords(f.second.Home)
				must(t, err)
				equal(t, len(records), 0)
			} else {
				equal(t, f.read(path), "TOKEN=later\n")
				records, err := local.ConflictRecords(f.second.Home)
				must(t, err)
				if len(records) > 0 {
					equal(t, f.read(records[0].Mine), "TOKEN=later\n")
				}
			}
			f.pull(f.second)
			if edit != "none" {
				equal(t, f.read(path), "TOKEN=later\n")
			}
		})
	}
}
