package git

import (
	stderrors "errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestGlobalConfigAndRewrites(t *testing.T) {
	f := repoFixture(t, t.TempDir())
	home := t.TempDir()
	t.Setenv("HOME", home)
	write(t, home, ".gitconfig", "[envden]\n test = global\n[safe]\n directory = "+f.Root+"\n[url \"git@github.com:\"]\n insteadOf = gh:\n[url \"https://host.test/a=b/\"]\n insteadOf = eq:\n")
	if _, e := git(f.Root, []string{"config", "--get", "envden.test"}, ""); e == nil {
		t.Fatal("read global unsafe config")
	}
	out, e := git(f.Root, []string{"config", "--get-all", "safe.directory"}, "")
	must(t, e)
	if strings.TrimSpace(out) != f.Root {
		t.Fatal(out)
	}
	gitTest(t, f.Root, "remote", "set-url", "origin", "gh:Foo/Bar.git")
	gitTest(t, f.Root, "remote", "add", "upstream", "eq:team/repo")
	a := CreateGitRepoAdapter(Options{ResolveSSHHost: func(s string) (string, error) { return s, nil }})
	c, e := a.CheckoutAt(f.Root)
	must(t, e)
	if c.RepoID != "github.com/foo/bar" || c.UpstreamRepoID == nil || *c.UpstreamRepoID != "host.test/a=b/team/repo" {
		t.Fatal(c)
	}
	gitTest(t, f.Root, "config", "url.https://gitlab.com/.insteadOf", "lab:")
	gitTest(t, f.Root, "remote", "set-url", "origin", "lab:Group/Repo")
	c, e = a.CheckoutAt(f.Root)
	must(t, e)
	if c.RepoID != "gitlab.com/group/repo" {
		t.Fatal(c)
	}
}

func TestUnsafeExclude(t *testing.T) {
	for _, kind := range []string{"symlink", "parent", "hardlink"} {
		t.Run(kind, func(t *testing.T) {
			f := repoFixture(t, t.TempDir())
			c, e := f.Repo.CheckoutAt(f.Root)
			must(t, e)
			target := filepath.Join(f.Root, "protected")
			write(t, f.Root, "protected", "keep")
			exclude := filepath.Join(c.GitDir, "info", "exclude")
			must(t, os.Remove(exclude))
			switch kind {
			case "symlink":
				must(t, os.Symlink(target, exclude))
			case "hardlink":
				must(t, os.Link(target, exclude))
			case "parent":
				must(t, os.Remove(filepath.Dir(exclude)))
				must(t, os.Symlink(f.Root, filepath.Dir(exclude)))
			}
			if f.Repo.EnsureIgnored(*c, ".env") == nil {
				t.Fatal("unsafe exclude accepted")
			}
			b, e := os.ReadFile(target)
			must(t, e)
			if string(b) != "keep" {
				t.Fatal("target changed")
			}
		})
	}
}

func TestAmbiguousMissingAndNonrepo(t *testing.T) {
	f := repoFixture(t, t.TempDir())
	if _, e := f.Repo.CheckoutAt(filepath.Join(f.Root, "missing")); !errors.Is(e, errors.Internal) {
		t.Fatal(e)
	}
	gitTest(t, f.Root, "remote", "rename", "origin", "one")
	gitTest(t, f.Root, "remote", "add", "two", "https://host/other")
	if _, e := f.Repo.CheckoutAt(f.Root); !errors.Is(e, errors.InvalidInput) {
		t.Fatal(e)
	}
}

func TestCaseProbe(t *testing.T) {
	for _, r := range []struct {
		names                 []string
		kind, name, alternate string
	}{{[]string{"123", ".git"}, "compare", ".git", ".Git"}, {[]string{"abc", "Abc"}, "sensitive", "", ""}, {[]string{"123"}, "empty", "", ""}} {
		k, n, a := caseProbe(r.names)
		if k != r.kind || n != r.name || a != r.alternate {
			t.Fatal(k, n, a)
		}
	}
	root := t.TempDir()
	if _, e := caseInsensitive(root, true); !errors.Is(e, errors.NotImplemented) {
		t.Fatal(e)
	}
	write(t, root, "CaseProbe", "")
	sensitive, e := caseInsensitive(root, false)
	must(t, e)
	readonly, e := caseInsensitive(root, true)
	must(t, e)
	if sensitive != readonly {
		t.Fatal("read-only mismatch")
	}
}

func TestExecutableConfigAndEmbeddedBare(t *testing.T) {
	f := repoFixture(t, t.TempDir())
	marker := filepath.Join(f.Root, "executed")
	script := filepath.Join(f.Root, "monitor")
	write(t, f.Root, "monitor", "#!/bin/sh\ntouch '"+marker+"'\n")
	must(t, os.Chmod(script, 0700)) //nolint:gosec // G302: fixture makes the approved test executable runnable.
	gitTest(t, f.Root, "config", "core.fsmonitor", script)
	write(t, f.Root, ".env", "secret")
	write(t, f.Root, ".gitignore", ".env\n")
	for _, args := range [][]string{{"ls-files", "-z", "--", ".env"}, {"check-ignore", "--", ".env"}, {"rev-parse", "--show-toplevel"}, {"worktree", "list", "--porcelain", "-z"}, {"remote", "get-url", "origin"}, {"config", "--get", "core.fsmonitor"}} {
		_, e := git(f.Root, args, "")
		must(t, e)
	}
	if _, e := os.Stat(marker); !os.IsNotExist(e) {
		t.Fatal("monitor executed", e)
	}
	bare := filepath.Join(f.Root, "embedded")
	gitTest(t, f.Root, "init", "--bare", bare)
	gitTest(t, bare, "config", "core.worktree", f.Root)
	gitTest(t, bare, "config", "core.bare", "false")
	gitTest(t, bare, "remote", "add", "origin", "https://evil.test/owned")
	c, e := f.Repo.CheckoutAt(bare)
	must(t, e)
	if c != nil {
		t.Fatal(c)
	}
}

func TestSSHResolution(t *testing.T) {
	failure := stderrors.New("ssh failed")
	for _, host := range []string{"-oProxyCommand=evil", "foo bar", "foo\nbar", "$(id)", ""} {
		_, e := resolveSSHHostWith(host, func(string, []string, map[string]string, string) (string, error) {
			t.Fatal("unsafe host executed")

			return "", nil
		})
		if !errors.Is(e, errors.InvalidInput) {
			t.Fatal(e)
		}
	}
	host, e := resolveSSHHostWith("work-git", func(command string, args []string, _ map[string]string, _ string) (string, error) {
		if command != "ssh" || strings.Join(args, " ") != "-G -- work-git" {
			t.Fatal(command, args)
		}

		return "user git\nhostname github.com  \nport 22\n", nil
	})
	must(t, e)
	if host != "github.com" {
		t.Fatal(host)
	}
	_, e = resolveSSHHostWith("work", func(string, []string, map[string]string, string) (string, error) { return "user git\n", nil })
	if !errors.Is(e, errors.Internal) {
		t.Fatal(e)
	}
	_, e = resolveSSHHostWith("work", func(string, []string, map[string]string, string) (string, error) { return "", failure })
	if !stderrors.Is(e, failure) {
		t.Fatal(e)
	}
}

func TestRemoteAndPathUnicode(t *testing.T) {
	if _, e := normalizeRepoID("https://host/team/%FFrepo", ""); !errors.Is(e, errors.InvalidInput) {
		t.Fatal(e)
	}
	if _, e := NormalizeRepoID("https://host/repo", ""); !errors.Is(e, errors.InvalidInput) {
		t.Fatal(e)
	}
	if comparePaths(".env.😀", ".env.\uffff") >= 0 {
		t.Fatal("paths do not use UTF-16 ordering")
	}
}
