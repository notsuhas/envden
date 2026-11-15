package git

import (
	"encoding/json"
	stderrors "errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

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

func TestRemoteVectors(t *testing.T) {
	b, e := os.ReadFile("testdata/repo-id-vectors.json")
	must(t, e)
	var vectors []struct{ Remote, Hostname, Expected string }
	must(t, json.Unmarshal(b, &vectors))
	for _, v := range vectors {
		got, e := normalizeRepoID(v.Remote, v.Hostname)
		if e != nil || got != v.Expected {
			t.Fatal(v, got, e)
		}
	}
	for _, remote := range []string{"/tmp/repo", "https://host/../", "git@host:../repo", "https://host/a/%2e%2e/b.git", "file:///tmp/repo", "https://host/team/%1brepo", "https://host/team/%E2%80%AErepo", "git@host:team/%1brepo", "git@host:team/%E2%80%AErepo"} {
		if _, e := normalizeRepoID(remote, ""); e == nil {
			t.Fatal(remote)
		}
	}
}

func TestWorktreesAndIdentity(t *testing.T) {
	f := repoFixture(t, t.TempDir())
	gitTest(t, f.Root, "remote", "rename", "origin", "sole")
	write(t, f.Root, "README", "test")
	gitTest(t, f.Root, "add", "README")
	gitTest(t, f.Root, "commit", "-qm", "initial")
	kept := filepath.Join(f.Root, "kept")
	gone := filepath.Join(f.Root, "gone")
	gitTest(t, f.Root, "worktree", "add", "-qb", "kept", kept)
	gitTest(t, f.Root, "worktree", "add", "-qb", "gone", gone)
	must(t, os.RemoveAll(gone))
	c, e := f.Repo.CheckoutAt(f.Root)
	must(t, e)
	other, e := f.Repo.CheckoutAt(kept)
	must(t, e)
	if c.GitDir != other.GitDir || other.RegisteredWorktree == nil || !*other.RegisteredWorktree {
		t.Fatal(c, other)
	}
	must(t, f.Repo.EnsureIgnored(*other, ".env.local"))
	for _, fallback := range []bool{false, true} {
		got, e := worktrees(func(args []string) (string, error) {
			if fallback && args[len(args)-1] == "-z" {
				return "", stderrors.New("unknown switch z")
			}
			return git(f.Root, args, "")
		})
		must(t, e)
		if !reflect.DeepEqual(got, []string{f.Root, kept}) {
			t.Fatal(got)
		}
	}
	forged := filepath.Join(f.Root, "forged")
	must(t, os.Mkdir(forged, 0700))
	write(t, forged, ".git", "gitdir: "+c.GitDir+"\n")
	fake, e := f.Repo.CheckoutAt(forged)
	must(t, e)
	if fake.RegisteredWorktree == nil || *fake.RegisteredWorktree {
		t.Fatal(fake)
	}
}

func TestDiscoveryAndTracking(t *testing.T) {
	f := repoFixture(t, t.TempDir())
	for _, dir := range []string{"apps", "dist", "nested", "libs/clone/.git"} {
		must(t, os.MkdirAll(filepath.Join(f.Root, dir), 0700))
	}
	for _, p := range []string{".env", ".env.local", ".env.example", ".envrc", ".env.production.defaults", "apps/.env", "dist/.env", ".env.tracked", ".env.visible", "nested/.env", "libs/clone/.env"} {
		write(t, f.Root, p, "A=1\n")
	}
	gitTest(t, f.Root, "add", ".env.tracked")
	gitTest(t, f.Root, "update-index", "--add", "--cacheinfo", "160000,1111111111111111111111111111111111111111,nested")
	must(t, os.Symlink("missing", filepath.Join(f.Root, ".env.dangling")))
	must(t, os.Symlink("nested/.env", filepath.Join(f.Root, ".env.shared")))
	write(t, f.Root, ".gitignore", ".env*\n!.env.visible\n")
	c, e := f.Repo.CheckoutAt(f.Root)
	must(t, e)
	got, e := f.Repo.EnvFiles(*c, nil)
	must(t, e)
	want := []string{".env", ".env.dangling", ".env.local", ".env.shared", "apps/.env"}
	if !reflect.DeepEqual(got, want) {
		t.Fatal(got, want)
	}
	ignored, e := f.Repo.IsIgnored(*c, ".env.tracked")
	must(t, e)
	if ignored {
		t.Fatal("tracked ignored")
	}
	if e = f.Repo.EnsureIgnored(*c, ".env.tracked"); e == nil || !strings.Contains(e.Error(), "tracked") {
		t.Fatal(e)
	}
}

func TestIgnoreEscapesAndRollback(t *testing.T) {
	f := repoFixture(t, t.TempDir())
	c, e := f.Repo.CheckoutAt(f.Root)
	must(t, e)
	if f.Repo.EnsureIgnored(*c, ".env\tlocal") == nil {
		t.Fatal("control accepted")
	}
	for _, p := range []string{".env.local name", ".env$(id)", ".env?[x]", ".env*"} {
		must(t, f.Repo.EnsureIgnored(*c, p))
		ok, e := f.Repo.IsIgnored(*c, p)
		must(t, e)
		if !ok {
			t.Fatal(p)
		}
	}
	for _, p := range []string{".env.l", ".env.other"} {
		ok, e := f.Repo.IsIgnored(*c, p)
		must(t, e)
		if ok {
			t.Fatal(p)
		}
	}
	write(t, f.Root, ".gitignore", "!.env.keep\n")
	exclude := filepath.Join(c.GitDir, "info", "exclude")
	before, e := os.ReadFile(exclude)
	must(t, e)
	if f.Repo.EnsureIgnored(*c, ".env.keep") == nil {
		t.Fatal("negation ignored")
	}
	after, e := os.ReadFile(exclude)
	must(t, e)
	if string(before) != string(after) {
		t.Fatal("rollback changed bytes")
	}
}
