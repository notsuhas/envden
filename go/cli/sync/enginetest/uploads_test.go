package enginetest

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconcile"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func TestTwoCopiesUploadOneBlob(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "copy")
	uploads := 0
	opts := f.opts
	opts.Fetcher = func(req *http.Request) (*http.Response, error) {
		if req.Method == "PUT" && strings.HasPrefix(req.URL.Path, "/v1/blobs/") {
			uploads++
		}

		return client.DefaultFetch(req)
	}

	for _, target := range targets {
		f.write(filepath.Join(target.Root, ".env"), "KEY=changed\n")
	}

	_, err := syncer.Push(f.ctx, f.second, opts)
	must(t, err)
	equal(t, uploads, 1)
	context, err := remote.SyncContext(f.ctx, f.second, f.opts, syncLinks(f))
	must(t, err)
	equal(t, len(context.Checkpoint.Files.Entries), 1)

	for _, target := range targets {
		equal(t, f.read(files.BasePath(f.second.Home, target.Store, target.Root)), "KEY=changed\n")
	}
}

func TestAppliedEntryCachesAndRefetchesBlob(t *testing.T) {
	f := newFixture(t)
	downloads := 0
	opts := f.opts
	opts.Fetcher = func(req *http.Request) (*http.Response, error) {
		if req.Method == "GET" && strings.HasPrefix(req.URL.Path, "/v1/blobs/") {
			downloads++
		}

		return client.DefaultFetch(req)
	}
	context, err := remote.SyncContext(f.ctx, f.first, opts, syncLinks(f))
	must(t, err)
	target := context.State.Links[0]
	target.Mode = "copy"
	context.State.Links = []state.Link{target}
	id, err := protocolfiles.FileID(context.Checkpoint.IdKey, f.checkout.RepoID, ".env")
	must(t, err)
	entry, err := remote.SealUpload(context, f.checkout.RepoID, ".env", id, nil, []byte("KEY=remote\n"))
	must(t, err)
	context.Checkpoint.Files = manifests.Files{Entries: []manifests.FileEntry{entry}}
	must(t, os.RemoveAll(filepath.Join(f.checkout.Root, ".env")))
	must(t, os.RemoveAll(target.Store))
	must(t, os.RemoveAll(filepath.Join(f.first.Home, "base")))
	must(t, os.RemoveAll(filepath.Join(f.first.Home, "state", "applied-files.json")))
	cache := filepath.Join(f.first.Home, "state", "blobs", client.Text(entry.BlobHash))
	must(t, os.Remove(cache))

	for _, want := range []int{1, 1, 2} {
		if want == 2 {
			must(t, os.RemoveAll(cache))
		}

		_, err = reconcile.Reconcile(context, map[string]bool{f.checkout.RepoID: true}, nil, nil)
		must(t, err)
		equal(t, downloads, want)
	}
}
