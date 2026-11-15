package git

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/core/process"
	suite "github.com/notsuhas/envden/go/testing/repo"
)

func gitTest(t *testing.T, root string, args ...string) string {
	t.Helper()
	out, e := process.ExecTrusted("git", append([]string{"-C", root}, args...), process.Options{})
	if e != nil {
		t.Fatal(args, e, out.Stderr)
	}

	return out.Stdout
}

func repoFixture(t *testing.T, directory string) suite.Fixture {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	root := filepath.Join(directory, "repo")
	outside := filepath.Join(directory, "outside")
	if e := os.MkdirAll(root, 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.MkdirAll(outside, 0700); e != nil {
		t.Fatal(e)
	}
	root, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	gitTest(t, root, "init", "-q")
	gitTest(t, root, "config", "user.email", "test@example.com")
	gitTest(t, root, "config", "user.name", "Test")
	gitTest(t, root, "remote", "add", "origin", "git@github.com:Owner/Repo.git")

	return suite.Fixture{Repo: CreateGitRepoAdapter(Options{ResolveSSHHost: func(string) (string, error) { return "GitHub.com", nil }}), Root: root, Outside: outside}
}

func TestContract(t *testing.T) { suite.RepoContract(t, repoFixture) }
