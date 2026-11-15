package git

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/adapters/repo/git/internal/fsmeta"
	"github.com/notsuhas/envden/go/core/adapters"
	errors "github.com/notsuhas/envden/go/core/errors"
)

func checkoutAt(path string, resolve func(string) (string, error)) (*adapters.Checkout, error) {
	s, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	dir := path
	if !s.IsDir() {
		dir = filepath.Dir(path)
	}
	root, err := git(dir, []string{"rev-parse", "--show-toplevel"}, "")
	if err != nil {
		if exitCode(err) >= 0 {
			return nil, nil
		}
		return nil, err
	}
	root = strings.TrimRight(root, " \t\r\n")
	output, err := git(root, []string{"remote"}, "")
	if err != nil {
		return nil, err
	}
	remotes := strings.Fields(output)
	name := ""
	for _, r := range remotes {
		if r == "origin" {
			name = r
		}
	}
	if name == "" && len(remotes) == 1 {
		name = remotes[0]
	}
	if name == "" {
		return nil, errors.New(errors.InvalidInput, "Choose a git remote for this checkout")
	}
	id, err := remoteID(root, name, resolve)
	if err != nil {
		return nil, err
	}
	common, err := git(root, []string{"rev-parse", "--git-common-dir"}, "")
	if err != nil {
		return nil, err
	}
	gitDir, err := filepath.EvalSymlinks(resolvePath(root, strings.TrimRight(common, " \t\r\n")))
	if err != nil {
		return nil, err
	}
	var upstream *string
	for _, r := range remotes {
		if r == "upstream" {
			v, e := remoteID(root, r, resolve)
			if e != nil {
				return nil, e
			}
			upstream = &v
		}
	}
	root, err = filepath.EvalSymlinks(root)
	if err != nil {
		return nil, err
	}
	ds, err := os.Lstat(gitDir)
	if err != nil {
		return nil, err
	}
	rs, err := os.Lstat(root)
	if err != nil {
		return nil, err
	}
	ddev, dino, dbirth, err := fsmeta.Identity(gitDir, ds)
	if err != nil {
		return nil, err
	}
	rdev, rino, rbirth, err := fsmeta.Identity(root, rs)
	if err != nil {
		return nil, err
	}
	identity := fmt.Sprintf("%d:%d:%s:%d:%s", ddev, dino, dbirth, rino, rbirth)
	device := int64(rdev)
	registered := registeredWorktree(root, gitDir)
	return &adapters.Checkout{Root: root, RepoID: id, GitDir: gitDir, UpstreamRepoID: upstream, Identity: &identity, RootDevice: &device, RegisteredWorktree: &registered}, nil
}

func resolvePath(root, path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	return filepath.Join(root, path)
}

func registeredWorktree(root, common string) bool {
	dotgit := filepath.Join(root, ".git")
	s, err := os.Lstat(dotgit)
	if err != nil || !s.Mode().IsRegular() {
		return false
	}
	out, err := git(root, []string{"rev-parse", "--git-dir"}, "")
	if err != nil {
		return false
	}
	private, err := filepath.EvalSymlinks(resolvePath(root, strings.TrimRight(out, " \r\n\t")))
	if err != nil {
		return false
	}
	registrations := filepath.Join(common, "worktrees")
	s, err = os.Lstat(registrations)
	if err != nil || !s.IsDir() || s.Mode()&os.ModeSymlink != 0 {
		return false
	}
	registrations, err = filepath.EvalSymlinks(registrations)
	if err != nil {
		return false
	}
	name, err := filepath.Rel(registrations, private)
	if err != nil || name == "." || name == ".." || strings.ContainsAny(name, `\/`) || filepath.IsAbs(name) {
		return false
	}
	backlink := filepath.Join(private, "gitdir")
	s, err = os.Lstat(backlink)
	if err != nil || !s.Mode().IsRegular() {
		return false
	}
	b, err := os.ReadFile(backlink)
	if err != nil {
		return false
	}
	back, err := filepath.EvalSymlinks(resolvePath(private, strings.TrimRight(string(b), " \t\r\n")))
	if err != nil {
		return false
	}
	real, err := filepath.EvalSymlinks(dotgit)
	return err == nil && back == real
}

func worktrees(run func([]string) (string, error)) ([]string, error) {
	args := []string{"worktree", "list", "--porcelain"}
	out, err := run(append(args, "-z"))
	sep := "\x00"
	if err != nil {
		out, err = run(args)
		sep = "\n"
	}
	if err != nil {
		return nil, err
	}
	return worktreePaths(out, sep), nil
}

func worktreePaths(output, sep string) []string {
	paths := []string{}
	for _, record := range strings.Split(output, sep+sep) {
		fields := strings.Split(record, sep)
		skip := false
		for _, f := range fields {
			if f == "bare" || strings.HasPrefix(f, "prunable") {
				skip = true
			}
		}
		if skip {
			continue
		}
		for _, f := range fields {
			if strings.HasPrefix(f, "worktree ") {
				paths = append(paths, filepath.Clean(f[9:]))
			}
		}
	}
	return paths
}

func submodulePaths(out string) []string {
	paths := []string{}
	for _, r := range strings.Split(out, "\x00") {
		if r != "" {
			paths = append(paths, r[strings.Index(r, "\n")+1:])
		}
	}
	return paths
}
