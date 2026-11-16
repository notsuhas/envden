package enginetest

import (
	"context"
	"errors"
	"github.com/notsuhas/envden/go/cli/client"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/cli/vault"
	e "github.com/notsuhas/envden/go/core/errors"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

func TestSyncRace(t *testing.T) {
	f := newFixture(t)
	equal(t, f.pull(f.second).Conflicts, 0)
	equal(t, f.read(filepath.Join(f.checkoutB.Root, ".env")), original)
	b := f.state(f.second).Links[0].Store
	f.write(f.aStore, original+"A=one\n")
	equal(t, f.push(f.first).Kind, "pushed")
	f.pull(f.second)
	if !strings.Contains(f.read(b), "A=one") {
		t.Fatal("missing first edit")
	}
	f.write(f.aStore, original+"A=two\n")
	f.write(b, original+"A=one\nB=one\n")
	raced := false
	opts := f.opts
	opts.Fetcher = func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/v1/swap" && !raced {
			raced = true
			f.push(f.first)
		}
		return client.DefaultFetch(req)
	}
	r, err := syncer.Push(f.ctx, f.second, opts)
	must(t, err)
	equal(t, r.Kind, "pushed")
	equal(t, raced, true)
	equal(t, f.read(b), original+"A=two\nB=one\n")
	f.pull(f.first)
	round := 0
	opts.Fetcher = func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/v1/swap" {
			round++
			f.write(f.aStore, original+"A=two\nB=one\nC="+string(rune('0'+round))+"\n")
			f.push(f.first)
		}
		return client.DefaultFetch(req)
	}
	f.write(b, original+"A=two\nB=two\n")
	_, err = syncer.Push(f.ctx, f.second, opts)
	if !e.Is(err, e.HeadMoved) {
		t.Fatal(err)
	}
}
func TestAcceptRefreshesNewerHistory(t *testing.T) {
	f := newFixture(t)
	c, err := remote.SyncContext(f.ctx, f.second, f.opts, syncLinks(f))
	must(t, err)
	h, err := vault.ReadHistory(f.ctx, c.Client, c.VaultID, c.State)
	must(t, err)
	seq := h.Headers[len(h.Headers)-1].Body.Seq
	f.write(f.aStore, "TOKEN=one\n")
	f.push(f.first)
	f.write(f.aStore, "TOKEN=two\n")
	f.push(f.first)
	_, err = remote.AcceptHead(c, &h, false)
	must(t, err)
	equal(t, c.Checkpoint.Header.Body.Seq, seq+2)
}
func TestExpiredUnlock(t *testing.T) {
	f := newFixture(t)
	locked := true
	prompts := 0
	opts := f.opts
	opts.Fetcher = func(req *http.Request) (*http.Response, error) {
		if locked && req.URL.Path != "/v1/hello" {
			return &http.Response{StatusCode: 403, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader("{\"error\":\"LOCKED\"}"))}, nil
		}
		return client.DefaultFetch(req)
	}
	no, yes := false, true
	opts.Interactive = &no
	_, err := syncer.Pull(f.ctx, f.second, opts)
	if !e.Is(err, e.Locked) || !strings.Contains(err.Error(), "envden unlock") {
		t.Fatal(err)
	}
	opts.Interactive = &yes
	opts.Unlock = func(_ context.Context, _ *client.Client, _ []byte) error { prompts++; locked = false; return nil }
	r, err := syncer.Pull(f.ctx, f.second, opts)
	must(t, err)
	equal(t, r.Kind, "pulled")
	equal(t, prompts, 1)
}
func lostFetch(req *http.Request) (*http.Response, error) {
	response, err := client.DefaultFetch(req)
	if err == nil && req.URL.Path == "/v1/swap" {
		response.Body.Close()
		return nil, errors.New("Lost response")
	}
	return response, err
}
