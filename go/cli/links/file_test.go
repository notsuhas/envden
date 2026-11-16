package links

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/store"
	"github.com/notsuhas/envden/go/core/adapters"
)

func TestSkippedPlacementSanitizesHomePath(t *testing.T) {
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
	if err != nil || report != "envden: ~/repo[31m/.env differs from the synced copy; skipped" {
		t.Fatal(report, err)
	}
}
