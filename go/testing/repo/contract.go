package repo

import (
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

type Fixture struct {
	Repo          adapters.Repo
	Root, Outside string
}

func RepoContract(t *testing.T, factory func(*testing.T, string) Fixture) {
	t.Helper()
	t.Run("nested checkout and worktrees", func(t *testing.T) {
		f := factory(t, t.TempDir())
		must(t, os.Mkdir(filepath.Join(f.Root, "nested"), 0700))
		c := requireCheckout(t, f.Repo, f.Root)
		nested := requireCheckout(t, f.Repo, filepath.Join(f.Root, "nested"))
		if !reflect.DeepEqual(c, nested) {
			t.Fatal("checkout differs")
		}
		out, e := f.Repo.CheckoutAt(f.Outside)
		must(t, e)
		if out != nil {
			t.Fatal("outside checkout")
		}
		trees, e := f.Repo.Worktrees(*c)
		must(t, e)
		if !slices.Contains(trees, c.Root) {
			t.Fatal(trees)
		}
	})
	t.Run("submodule git parser", func(t *testing.T) {
		f := factory(t, t.TempDir())
		c := requireCheckout(t, f.Repo, f.Root)
		paths, e := f.Repo.Submodules(*c)
		must(t, e)
		if len(paths) != 0 {
			t.Fatal(paths)
		}
		write(t, f.Root, ".gitmodules", "[submodule \"a\"]\n\tpath = \"mods/with space\" ; note\n\turl = x\n[submodule \"b\"]\n  Path=libs/b\n")
		paths, e = f.Repo.Submodules(*c)
		must(t, e)
		if !reflect.DeepEqual(paths, []string{"mods/with space", "libs/b"}) {
			t.Fatal(paths)
		}
	})
	t.Run("unencodable and unreadable directories", func(t *testing.T) {
		f := factory(t, t.TempDir())
		c := requireCheckout(t, f.Repo, f.Root)
		write(t, f.Root, ".gitignore", ".env\n")
		write(t, f.Root, ".env", "A=1")
		for _, name := range []string{"aux", "a:b", "trail ", "unreadable"} {
			must(t, os.Mkdir(filepath.Join(f.Root, name), 0700))
			write(t, f.Root, name+"/.env", "A=1")
		}
		blocked := filepath.Join(f.Root, "unreadable")
		must(t, os.Chmod(blocked, 0))
		defer func() { _ = os.Chmod(blocked, 0700) }() //nolint:gosec // G302: fixture restores directory access so temporary files can be removed.
		files, e := f.Repo.EnvFiles(*c, nil)
		must(t, e)
		if !slices.Contains(files, ".env") {
			t.Fatal(files)
		}
		for _, p := range files {
			if p != ".env" && (p != "unreadable/.env" || os.Getuid() != 0) {
				t.Fatal(files)
			}
		}
	})
	t.Run("rules and ignored special paths", func(t *testing.T) {
		f := factory(t, t.TempDir())
		c := requireCheckout(t, f.Repo, f.Root)
		must(t, os.Mkdir(filepath.Join(f.Root, "generated"), 0700))
		write(t, f.Root, ".gitignore", ".env*\nsecrets.conf\n")
		for _, p := range []string{".env", ".env.local", "secrets.conf", ".envrc", "generated/.env"} {
			write(t, f.Root, p, "A=1\n")
		}
		for _, row := range []struct {
			rules adapters.EnvFileRules
			want  []string
		}{{adapters.EnvFileRules{Include: []string{"secrets.*", ".envrc"}}, []string{"secrets.conf"}}, {adapters.EnvFileRules{Exclude: []string{"*.local"}}, []string{".env", "generated/.env"}}, {adapters.EnvFileRules{ExtraSkipped: []string{"generated"}}, []string{".env", ".env.local"}}} {
			got, e := f.Repo.EnvFiles(*c, &row.rules)
			must(t, e)
			if !reflect.DeepEqual(got, row.want) {
				t.Fatal(got, row.want)
			}
		}
		must(t, os.Mkdir(filepath.Join(f.Root, "(auth)"), 0700))
		write(t, f.Root, "(auth)/.env", "A=1")
		must(t, f.Repo.EnsureIgnored(*c, "(auth)/.env"))
	})
	t.Run("exact idempotent ignores and discovery", func(t *testing.T) {
		f := factory(t, t.TempDir())
		c := requireCheckout(t, f.Repo, f.Root)
		for _, p := range []string{".env", ".env.local", ".env.example", ".envrc", ".env.visible"} {
			write(t, f.Root, p, "A=1\n")
		}
		write(t, f.Root, ".gitignore", ".env.example\n.envrc\n")
		ignored, e := f.Repo.IsIgnored(*c, ".env")
		must(t, e)
		if ignored {
			t.Fatal("unexpected ignore")
		}
		for _, p := range []string{".env", ".env", ".env.local"} {
			must(t, f.Repo.EnsureIgnored(*c, p))
			ignored, e = f.Repo.IsIgnored(*c, p)
			must(t, e)
			if !ignored {
				t.Fatal(p)
			}
		}
		got, e := f.Repo.EnvFiles(*c, nil)
		must(t, e)
		if !reflect.DeepEqual(got, []string{".env", ".env.local"}) {
			t.Fatal(got)
		}
		ignored, e = f.Repo.IsIgnored(*c, ".env.visible")
		must(t, e)
		if ignored {
			t.Fatal("visible ignored")
		}
		if f.Repo.EnsureIgnored(*c, "../outside") == nil {
			t.Fatal("unsafe path accepted")
		}
	})
}

func must(t *testing.T, e error) {
	t.Helper()
	if e != nil {
		t.Fatal(e)
	}
}

func write(t *testing.T, root, path, contents string) {
	t.Helper()
	must(t, os.WriteFile(filepath.Join(root, path), []byte(contents), 0600))
}

func requireCheckout(t *testing.T, r adapters.Repo, path string) *adapters.Checkout {
	t.Helper()
	c, e := r.CheckoutAt(path)
	must(t, e)
	if c == nil {
		t.Fatal("Expected checkout")
	}

	return c
}
