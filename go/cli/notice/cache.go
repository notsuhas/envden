package notice

import (
	"context"
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
)

type LocalNotice struct {
	RepoID string `json:"repoId"`
	Status string `json:"status"`
}

func NoticeStatus(home string, s *model.State) ([]LocalNotice, error) {
	result := []LocalNotice{}
	seen := map[string]bool{}
	for _, l := range s.Links {
		if l.LocalOnly {
			continue
		}

		basePath := localfiles.BasePath(home, l.Store)
		path := l.Store
		if l.Mode == "copy" {
			basePath = localfiles.BasePath(home, l.Store, l.Root)
			path = filepath.Join(l.Root, l.Path)
		}

		base, e := localfiles.ReadBytes(basePath)
		if e != nil {
			return nil, e
		}

		local, e := localfiles.ReadBytes(path)
		if e != nil {
			return nil, e
		}

		if localfiles.Same(base, local) {
			continue
		}

		for _, c := range s.Approved {
			if c.Root == l.Root {
				repo := c.RepoID
				if a, ok := s.Aliases.Get(repo).(string); ok {
					repo = a
				}

				if !seen[repo] {
					seen[repo] = true
					result = append(result, LocalNotice{repo, "local changes"})
				}

				break
			}
		}
	}

	return result, nil
}

func CachedNotice(home string) (string, error) {
	raw, e := files.OptionalRead(filepath.Join(home, "state", "notice"))
	if e != nil || raw == nil {
		return "", e
	}

	lines := strings.Split(*raw, "\n")
	for i := range lines {
		lines[i] = output.SanitizeTerminal(lines[i])
	}

	return strings.Join(lines, "\n"), nil
}

func RefreshNotice(ctx context.Context, home string, s *model.State, insensitive func(string) (bool, error), now func() int64, timing lock.Timing) error {
	return lock.WithStateLock(ctx, home, timing, func(context.Context) error {
		roots := []string{}
		fold := []string{}
		for _, c := range s.Approved {
			if safeRoot(c.Root) {
				roots = append(roots, c.Root)
				yes, _ := insensitive(c.Root)
				if yes {
					fold = append(fold, c.Root)
				}
			}
		}

		if e := files.AtomicWrite(filepath.Join(home, "state", "approved-checkouts"), []byte(strings.Join(roots, "\n")+"\n"), now); e != nil {
			return e
		}

		if e := files.AtomicWrite(filepath.Join(home, "state", "approved-checkouts-insensitive"), []byte(strings.Join(fold, "\n")+"\n"), now); e != nil {
			return e
		}

		local, e := NoticeStatus(home, s)
		if e != nil {
			return e
		}

		remote := ReadRemoteNotice(home)
		repos := []string{}
		for _, v := range local {
			repos = appendUnique(repos, v.RepoID)
		}

		if remote != nil {
			for _, repo := range remote.Repos {
				repos = appendUnique(repos, repo)
			}
		}

		lines := []string{}
		for _, repo := range repos {
			lines = append(lines, "envden: "+output.SanitizeTerminal(repo)+" out of sync")
		}

		return files.AtomicWrite(filepath.Join(home, "state", "notice"), []byte(linesText(lines)), now)
	})
}

func appendUnique(values []string, value string) []string {
	for _, v := range values {
		if v == value {
			return values
		}
	}

	return append(values, value)
}

func linesText(lines []string) string {
	if len(lines) == 0 {
		return ""
	}

	return strings.Join(lines, "\n") + "\n"
}

func safeRoot(root string) bool {
	return root != "" && output.SanitizeTerminal(root) == root && !strings.ContainsAny(root, "\r\n")
}
