package enginetest

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/adapters"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
)

var osRead = os.ReadFile

var savedReport = regexp.MustCompile("^(?:Saved .*: |Kept your previous .* at )(.+)$")

func (f *fixture) serverValue() value {
	c, err := remote.SyncContext(f.ctx, f.third, f.opts, syncLinks(f))
	must(f.t, err)
	h, err := vault.ReadHistory(f.ctx, c.Client, c.VaultID, c.State)
	must(f.t, err)
	_, err = remote.AcceptHead(c, &h, false)
	must(f.t, err)

	for _, entry := range c.Checkpoint.Files.Entries {
		name, err := remote.EntryName(c, entry)
		must(f.t, err)

		if name.RepoId == f.checkout.RepoID && name.Path == ".env" {
			b, err := remote.EntryContent(c, entry)
			must(f.t, err)

			return value{string(b), b != nil}
		}
	}

	return value{}
}

func (r *interleaving) apply(d, op int, edit string) {
	f := r.f
	a := r.devices[d]
	path := filepath.Join(r.roots[d], ".env")

	switch op {
	case 0, 1:
		if op == 1 {
			edit = original
		}
		r.user(d, value{edit, true})
		if d == 0 {
			path = r.stores[d]
		}
		f.write(path, edit)
	case 2, 5:
		r.receive(d, op == 5)
	case 3, 4:
		r.send(d, op == 4)
	case 6:
		r.user(d, value{})
		result, err := syncer.RemoveFile(f.ctx, a, path, syncer.RemoveOptions{Yes: true, Now: clock})
		if err != nil && !envdenerrors.Is(err, envdenerrors.NotFound) {
			must(f.t, err)
		}
		r.saved = append(r.saved, result.Preserved...)
	case 7, 8:
		choice := "keep-mine"
		if op == 8 {
			choice = "take-server"
		}
		result, err := syncer.ResolveConflict(f.ctx, a, syncer.ResolveOptions{File: ".env", Choice: choice, Now: clock})
		if err != nil {
			if !envdenerrors.Is(err, envdenerrors.InvalidInput) {
				must(f.t, err)
			}
		} else {
			r.saved = append(r.saved, result.Preserved...)
			r.observe(d)
		}
	case 9:
		s := f.state(a)
		var c adapters.Checkout
		for _, item := range s.Approved {
			if item.Root == r.roots[d] {
				c = adapters.Checkout{Root: item.Root, GitDir: item.GitDir, RepoID: item.RepoID}
			}
		}
		_, err := checkout.Untrack(f.ctx, a, r.roots[d])
		must(f.t, err)
		next := f.state(a)
		next.Approved = append(next.Approved, checkout.ApprovalRecord(c))
		if readValue(path).present {
			_, err = links.LinkFile(f.ctx, a, next, c, a.Placement("copy", c.Root), ".env", nil, nil)
			must(f.t, err)
		}
		f.save(a, next)
	}
}

func (r *interleaving) receive(d int, fail bool) syncer.Result {
	a := r.devices[d]
	original := a.Repo

	if fail {
		a.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: original.CheckoutAt, CaseInsensitive: original.CaseInsensitive, EnsureIgnored: func(adapters.Checkout, string) error { return errors.New("Placement failure") }})
	}

	result, err := syncer.Pull(r.f.ctx, a, r.options())
	must(r.f.t, err)
	a.Repo = original

	if result.Conflicts == 0 {
		r.observe(d)
		again, err := syncer.Pull(r.f.ctx, a, r.options())
		must(r.f.t, err)
		equal(r.f.t, again.Changed, 0)
	}

	return result
}

func (r *interleaving) send(d int, lost bool) {
	opts := r.options()

	if lost {
		opts.Fetcher = func(req *http.Request) (*http.Response, error) {
			response, err := r.devices[d].Fetcher(req)
			if err == nil && req.URL.Path == "/v1/swap" {
				_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.

				return nil, errors.New("Lost response")
			}

			return response, err
		}
	}

	_, err := syncer.Push(r.f.ctx, r.devices[d], opts)
	if err != nil && (!lost || !strings.Contains(err.Error()+causeText(err), "Lost response")) {
		must(r.f.t, err)
	}

	r.commit(d)
}

func causeText(err error) string {
	if cause := errors.Unwrap(err); cause != nil {
		return cause.Error()
	}

	return ""
}
