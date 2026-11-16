package enginetest

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/notice"
	"github.com/notsuhas/envden/go/cli/state/lock"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"net/http"
	"path/filepath"
	"testing"
)

func TestLocalOnlyFilesAbsentFromRemoteNotices(t *testing.T) {
	f := newFixture(t)
	s := f.state(f.second)
	s.Links = append(s.Links, state.Link{Root: f.checkoutB.Root, Path: ".env", Store: filepath.Join(f.second.Home, "store", "local"), Mode: "copy", LocalOnly: true})
	f.save(f.second, s)
	r, err := notice.RemoteNotice(f.ctx, f.second, f.opts)
	must(t, err)
	equal(t, len(r.Repos), 0)
	f.pull(f.second)
	equal(t, len(notice.ReadRemoteNotice(f.second.Home).Repos), 0)
}
func TestInitialPushAndPullSettleNotices(t *testing.T) {
	f := newFixture(t)
	r, err := notice.RemoteNotice(f.ctx, f.first, f.opts)
	must(t, err)
	equal(t, len(r.Repos), 0)
	local, err := notice.NoticeStatus(f.first.Home, f.state(f.first))
	must(t, err)
	equal(t, len(local), 0)
	r, err = notice.RemoteNotice(f.ctx, f.second, f.opts)
	must(t, err)
	equal(t, len(r.Repos), 1)
	equal(t, r.Repos[0], f.checkout.RepoID)
	f.pull(f.second)
	equal(t, len(notice.ReadRemoteNotice(f.second.Home).Repos), 0)
}
func TestBackgroundRefreshDoesNotHoldStateLock(t *testing.T) {
	f := newFixture(t)
	ready, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	a := f.second
	first := true
	a.Fetcher = func(req *http.Request) (*http.Response, error) {
		if first {
			first = false
			close(ready)
			<-release
		}
		return client.DefaultFetch(req)
	}
	go func() {
		defer close(done)
		notice.CommandNotice(f.ctx, a, clock(), true, "", false, nil, notice.Hooks{Remote: func(ctx context.Context, a contracts.Adapters, now int64) error {
			opts := f.opts
			opts.Fetcher = a.Fetcher
			_, err := notice.RemoteNotice(ctx, a, opts)
			return err
		}})
	}()
	<-ready
	err := lock.WithStateLock(f.ctx, a.Home, a.Timing, func(context.Context) error { return nil })
	close(release)
	<-done
	must(t, err)
	remote := notice.ReadRemoteNotice(a.Home)
	if remote == nil {
		t.Fatal("missing notice")
	}
	equal(t, remote.CheckedAt, clock())
}
func TestForegroundInspectsFreshRemoteHistory(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	requests := 0
	a := f.second
	a.Fetcher = func(req *http.Request) (*http.Response, error) { requests++; return client.DefaultFetch(req) }
	hooks := notice.Hooks{Remote: func(ctx context.Context, a contracts.Adapters, now int64) error {
		opts := f.opts
		opts.Fetcher = a.Fetcher
		_, err := notice.RemoteNotice(ctx, a, opts)
		return err
	}}
	env := map[string]string{"ENVDEN_NO_UPDATE_CHECK": "1"}
	notice.CommandNotice(f.ctx, a, clock(), true, "", false, env, hooks)
	equal(t, requests, 0)
	notice.CommandNotice(f.ctx, a, clock(), false, "", false, env, hooks)
	if requests == 0 {
		t.Fatal("no foreground requests")
	}
	before := requests
	notice.CommandNotice(f.ctx, a, clock(), false, "", false, env, hooks)
	if requests <= before {
		t.Fatal("second foreground skipped history")
	}
}
