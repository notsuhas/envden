package discovery

import (
	"fmt"
	"github.com/notsuhas/envden/go/core/adapters"
	fake "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
)

func mkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0700); err != nil {
		t.Fatal(err)
	}
}
func link(t *testing.T, target, path string) {
	t.Helper()
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
}

func TestDiscoveryPaths(t *testing.T) {
	home, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	app := filepath.Join(home, "Work", "app")
	worktree := filepath.Join(home, ".t3", "feature")
	sub := filepath.Join(app, "mods", "sub")
	for _, p := range []string{app, worktree, sub, filepath.Join(app, "vendor", "clone"), filepath.Join(home, "node_modules", "dep"), filepath.Join(home, ".hidden", "repo"), filepath.Join(home, "excluded", "repo")} {
		mkdir(t, filepath.Join(p, ".git"))
	}
	link(t, filepath.Join(home, "Work"), filepath.Join(home, "visible"))
	link(t, home, filepath.Join(home, "Work", "loop"))
	var mu sync.Mutex
	asked := map[string]int{}
	repo := fake.CreateFakeRepoAdapter(fake.Operations{CheckoutAt: func(path string) (*adapters.Checkout, error) {
		mu.Lock()
		asked[path]++
		mu.Unlock()
		return &adapters.Checkout{Root: path, RepoID: path, GitDir: path + "/.git"}, nil
	}, Worktrees: func(c adapters.Checkout) ([]string, error) {
		if c.Root == app {
			return []string{app, worktree}, nil
		}
		return nil, nil
	}, Submodules: func(c adapters.Checkout) ([]string, error) {
		if c.Root == app {
			return []string{"mods/sub", "../outside"}, nil
		}
		return nil, nil
	}})
	progress := []int{}
	found, err := DiscoverRepos(repo, DiscoveryScope{Roots: []string{home}, Home: home, Excluded: []string{filepath.Join(home, "excluded")}}, DiscoveryEvents{Progress: func(n int) { progress = append(progress, n) }})
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, c := range found {
		got = append(got, c.Root)
	}
	if !reflect.DeepEqual(got, []string{worktree, app, sub}) {
		t.Fatalf("found %q", got)
	}
	if !reflect.DeepEqual(progress, []int{1, 2, 3}) {
		t.Fatalf("progress %v", progress)
	}
	for path, n := range asked {
		if n != 1 {
			t.Fatalf("%s visited %d times", path, n)
		}
	}
}

func TestDiscoveryConcurrencyAndOrder(t *testing.T) {
	home, _ := filepath.EvalSymlinks(t.TempDir())
	for i := 0; i < 30; i++ {
		mkdir(t, filepath.Join(home, fmt.Sprintf("repo-%02d", i), ".git"))
	}
	var mu sync.Mutex
	active, peak := 0, 0
	gate := make(chan struct{})
	var release sync.Once
	repo := fake.CreateFakeRepoAdapter(fake.Operations{CheckoutAt: func(path string) (*adapters.Checkout, error) {
		mu.Lock()
		active++
		if active > peak {
			peak = active
		}
		if active == 8 {
			release.Do(func() { close(gate) })
		}
		mu.Unlock()
		<-gate
		mu.Lock()
		active--
		mu.Unlock()
		return &adapters.Checkout{Root: path}, nil
	}, Worktrees: func(adapters.Checkout) ([]string, error) { return nil, nil }, Submodules: func(adapters.Checkout) ([]string, error) { return nil, nil }})
	found, err := DiscoverRepos(repo, DiscoveryScope{Roots: []string{home}})
	if err != nil {
		t.Fatal(err)
	}
	if peak != 8 || len(found) != 30 {
		t.Fatalf("peak %d found %d", peak, len(found))
	}
	for i, c := range found {
		want := filepath.Join(home, fmt.Sprintf("repo-%02d", i))
		if c.Root != want {
			t.Fatalf("got %s want %s", c.Root, want)
		}
	}
}

func TestFolderRules(t *testing.T) {
	for _, row := range []struct {
		name  string
		place FolderPlace
		want  bool
	}{{".cache", FolderPlace{}, true}, {"node_modules", FolderPlace{}, true}, {"go", FolderPlace{Home: true}, true}, {"go", FolderPlace{}, false}, {"target", FolderPlace{Project: true}, true}, {"target", FolderPlace{}, false}, {"visible", FolderPlace{}, false}} {
		if SkippedFolder(row.name, row.place) != row.want {
			t.Fatal(row)
		}
	}
}
