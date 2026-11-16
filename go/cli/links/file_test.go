package links

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	fsplacement "github.com/notsuhas/envden/go/adapters/placement/fs"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/store"
	"github.com/notsuhas/envden/go/core/adapters"
)

func TestSkippedPlacementSanitizesAbsolutePath(t *testing.T) {
	home := t.TempDir()
	root := filepath.Join(home, "repo\x1b[31m")
	if err := os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(root, ".env")
	if err := os.WriteFile(dest, []byte("A=local"), 0600); err != nil {
		t.Fatal(err)
	}
	stored, err := store.StorePath(home, "repo", ".env")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.MkdirAll(filepath.Dir(stored), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(stored, []byte("A=remote"), 0600); err != nil {
		t.Fatal(err)
	}
	var report string
	_, err = LinkFile(context.Background(), contracts.Adapters{Home: home, UserHome: home}, model.EmptyState("test"), adapters.Checkout{Root: root, RepoID: "repo"}, nil, ".env", nil, func(s string) { report = s })
	if err != nil || report != "envden: "+filepath.Join(home, "repo[31m", ".env")+" differs from the synced copy; skipped" {
		t.Fatal(report, err)
	}
}

func TestDeletedLinkResolvesHomeBeforeAbbreviation(t *testing.T) {
	home, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(t.TempDir(), "home")
	if err = os.Symlink(home, alias); err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(home, "repo\x1b[31m")
	if err = os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	stored, err := store.StorePath(home, "repo", ".env")
	if err != nil {
		t.Fatal(err)
	}
	destination := filepath.Join(root, ".env")
	if err = os.Symlink(stored, destination); err != nil {
		t.Fatal(err)
	}
	placement := fsplacement.CreateFsPlacementAdapter(adapters.PlacementLink, root, filepath.Join(home, "backups"), func() int64 { return 1000 })
	var report string
	_, err = LinkFile(context.Background(), contracts.Adapters{Home: home, UserHome: alias}, model.EmptyState("test"), adapters.Checkout{Root: root, RepoID: "repo"}, placement, ".env", nil, func(s string) { report = s })
	if err != nil || report != "envden: removed ~/repo[31m/.env, a link to a deleted copy" {
		t.Fatal(report, err)
	}
}
