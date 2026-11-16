package enginetest

import (
	"encoding/json"
	placementfs "github.com/notsuhas/envden/go/adapters/placement/fs"
	"github.com/notsuhas/envden/go/cli/settings"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/core/adapters"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCopyPreferenceAndBackupPruning(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(f.second.Home, "conflicts", ".envden-backup-0-00000000-0000-0000-0000-000000000000")
	f.write(path, "old backup")
	config, err := json.Marshal(map[string]string{f.checkoutB.Root: "copy"})
	must(t, err)
	_, err = settings.SetConfig(f.ctx, "placement", string(config), f.second.Home, f.second.Timing, false)
	must(t, err)
	calls := []int64{}
	f.second.PrunePlacementBackups = func(at int64) error {
		calls = append(calls, at)
		return placementfs.PruneBackups(filepath.Join(f.second.Home, "conflicts"), at, 30)
	}
	f.pull(f.second)
	equal(t, len(calls), 1)
	equal(t, calls[0], clock())
	equal(t, f.state(f.second).Links[0].Mode, "copy")
	info, err := os.Lstat(filepath.Join(f.checkoutB.Root, ".env"))
	must(t, err)
	equal(t, info.Mode()&os.ModeSymlink != 0, false)
	equal(t, readValue(path).present, false)
}
func TestWorktreePlacementHonorsSetting(t *testing.T) {
	f := newFixture(t)
	worktree := f.checkoutB
	worktree.Root = filepath.Join(f.root, "worktree")
	registered := true
	worktree.RegisteredWorktree = &registered
	must(t, os.MkdirAll(worktree.Root, 0700))
	f.repo(&f.second, []adapters.Checkout{worktree, f.checkoutB})
	reports := []string{}
	opts := f.opts
	opts.All = false
	opts.Cwd = worktree.Root
	opts.Report = func(v string) { reports = append(reports, v) }
	_, err := settings.SetConfig(f.ctx, "auto-approve-worktrees", "off", f.second.Home, f.second.Timing, false)
	must(t, err)
	_, err = syncer.Pull(f.ctx, f.second, opts)
	if err == nil || !strings.Contains(err.Error(), "approved checkout") {
		t.Fatal(err)
	}
	equal(t, readValue(filepath.Join(worktree.Root, ".env")).present, false)
	_, err = settings.SetConfig(f.ctx, "auto-approve-worktrees", "on", f.second.Home, f.second.Timing, true)
	must(t, err)
	_, err = syncer.Pull(f.ctx, f.second, opts)
	must(t, err)
	if !strings.Contains(strings.Join(reports, "\n"), worktree.Root) {
		t.Fatal(reports)
	}
	equal(t, f.read(filepath.Join(worktree.Root, ".env")), original)
	found := false
	for _, c := range f.state(f.second).Approved {
		if c.Root == worktree.Root {
			found = true
		}
	}
	equal(t, found, true)
}
