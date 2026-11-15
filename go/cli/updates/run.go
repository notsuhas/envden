package updates

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/updates/check"
	"net/http"
	"sync/atomic"
)

func RunUpdateCheck(ctx context.Context, a contracts.Adapters, now int64, force bool, env map[string]string) (check.Result, error) {
	config, e := settings.ReadConfig(a.Home)
	if e != nil {
		return check.Result{}, e
	}
	if !force && !settings.UpdateCheckEnabled(config.UpdateCheck, env) {
		return check.Result{Kind: "skipped"}, nil
	}
	cache := ReadUpdateCache(a.Home)
	var sent atomic.Bool
	fetch := a.Fetcher
	tracked := func(r *http.Request) (*http.Response, error) {
		if e := r.Context().Err(); e != nil {
			return nil, e
		}
		sent.Store(true)
		return fetch(r)
	}
	result := check.CheckRelease(ctx, cache.CheckedAt, now, tracked, force)
	if result.Kind == "skipped" {
		return result, nil
	}

	if result.Kind == "checked" {
		cache.Latest = result.Latest
		cache.touch("latest")
		cache.Message = ""
	} else {
		cache.Message = result.Message
		cache.touch("message")
	}
	if sent.Load() {
		cache.CheckedAt = &now
		cache.touch("checkedAt")
	}
	e = lock.WithStateLock(ctx, a.Home, a.Timing, func(context.Context) error { return SaveUpdateCache(a.Home, cache, a.Now) })
	return result, e
}
