package enginetest

import (
	"errors"
	sf "github.com/notsuhas/envden/go/cli/state/files"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/adapters"
	fakeplace "github.com/notsuhas/envden/go/testing/placement"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestInterruptedWritesConverge(t *testing.T) {
	for _, step := range []string{"store", "copy-0", "copy-1", "base-0", "base-1", "base-store", "applied"} {
		t.Run(step, func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout("copy", "copy", "link")
			store := targets[0].Store
			f.write(f.aStore, "TOKEN=remote\n")
			f.push(f.first)
			failures := 0
			paths := map[string]string{"store": store, "base-0": files.BasePath(f.second.Home, store, targets[0].Root), "base-1": files.BasePath(f.second.Home, store, targets[1].Root), "base-store": files.BasePath(f.second.Home, store), "applied": filepath.Join(f.second.Home, "state", "applied-files.json")}
			opts := f.opts
			opts.AtomicWrite = func(path string, data []byte) error {
				if !strings.HasPrefix(step, "copy") && path == paths[step] {
					failures++
					if failures == 1 {
						return errors.New("injected write failure")
					}
				}
				return sf.AtomicWrite(path, data, clock)
			}
			original := f.second.Placement
			f.second.Placement = func(mode adapters.PlacementMode, root string) adapters.Placement {
				p := original(mode, root)
				return fakeplace.CreateFakePlacementAdapter(fakeplace.Operations{Mode: mode, Supported: p.Supported, Inspect: p.Inspect, Remove: p.Remove, Place: func(store, dest string, prepare func(string) error, replacing *string) error {
					if strings.HasPrefix(step, "copy") {
						index, err := strconv.Atoi(step[len(step)-1:])
						must(t, err)
						if root == targets[index].Root {
							failures++
							if failures == 1 {
								return errors.New("injected write failure")
							}
						}
					}
					return p.Place(store, dest, prepare, replacing)
				}})
			}
			_, _ = syncer.Pull(f.ctx, f.second, opts)
			f.second.Placement = original
			if failures == 0 {
				t.Fatal("fault was not exercised")
			}
			equal(t, f.pull(f.second).Conflicts, 0)
			equal(t, f.read(store), "TOKEN=remote\n")
			for _, target := range targets {
				equal(t, f.read(filepath.Join(target.Root, target.Path)), "TOKEN=remote\n")
			}
		})
	}
}
