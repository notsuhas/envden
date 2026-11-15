package notice

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/updates"
	"path/filepath"
	"runtime"
	"strings"
)

type Result struct {
	Repos  []string
	Update updates.Status
}
type Hooks struct {
	Remote  func(context.Context, contracts.Adapters, int64) error
	Pending func(string, func() int64) error
}

func CommandNotice(ctx context.Context, a contracts.Adapters, now int64, refresh bool, cwd string, localOnly bool, env map[string]string, hooks Hooks) (result Result) {
	result = Result{Repos: []string{}}
	e := func() error {
		if e := updates.CleanupOldBinary(a.Executable, runtime.GOOS == "windows"); e != nil {
			return e
		}
		if !refresh && hooks.Pending != nil {
			if e := lock.WithStateLock(ctx, a.Home, a.Timing, func(context.Context) error { return hooks.Pending(a.Home, a.Now) }); e != nil {
				return e
			}
		}
		s, e := store.LoadState(a.Home)
		if e != nil {
			return e
		}
		if !localOnly && s != nil && hooks.Remote != nil {
			remote := ReadRemoteNotice(a.Home)
			if s.Checkpoint != "" && (!refresh || remote == nil || now-remote.CheckedAt >= 60000) {
				_ = hooks.Remote(ctx, a, now)
			}
		}
		if !refresh && !localOnly {
			if _, e = updates.RunUpdateCheck(ctx, a, now, false, env); e != nil {
				return e
			}
		}
		return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
			s, e := store.LoadState(a.Home)
			if e != nil {
				return e
			}
			if s == nil {
				result.Update = updates.UpdateStatus(a.Home)
				return nil
			}
			if !refresh && hooks.Pending != nil {
				if e = hooks.Pending(a.Home, a.Now); e != nil {
					return e
				}
			}
			remote := ReadRemoteNotice(a.Home)
			if e = RefreshNotice(ctx, a.Home, s, func(root string) (bool, error) { return a.Repo.CaseInsensitive(root, true) }, a.Now, a.Timing); e != nil {
				return e
			}
			result.Update = updates.UpdateStatus(a.Home)
			if e = CacheOffers(a, s, cwd, result.Update, now); e != nil {
				return e
			}
			local, e := NoticeStatus(a.Home, s)
			if e != nil {
				return e
			}
			current := ""
			absolute, _ := filepath.Abs(cwd)
			for _, c := range s.Approved {
				if cwd != "" && (absolute == c.Root || strings.HasPrefix(absolute, c.Root+string(filepath.Separator))) {
					current = c.RepoID
					if alias, ok := s.Aliases.Get(current).(string); ok {
						current = alias
					}
					break
				}
			}
			repos := []string{}
			for _, l := range local {
				repos = appendUnique(repos, l.RepoID)
			}
			if remote != nil {
				for _, repo := range remote.Repos {
					repos = appendUnique(repos, repo)
				}
			}
			for _, repo := range repos {
				if repo != current {
					result.Repos = append(result.Repos, output.SanitizeTerminal(repo))
				}
			}
			return nil
		})
	}()
	if e != nil {
		return Result{Repos: []string{}}
	}
	return result
}
