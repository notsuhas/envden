package enginetest

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	hf "github.com/notsuhas/envden/go/cli/history/files"
	hl "github.com/notsuhas/envden/go/cli/history/list"
	hr "github.com/notsuhas/envden/go/cli/history/restore"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	e "github.com/notsuhas/envden/go/core/errors"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

const v2 = original + "DB_URL=postgres://secret-db-v2\n"
const v3 = "TOKEN=rotated-secret-v3\nDB_URL=postgres://secret-db-v2\n"

func threeVersions(t *testing.T) *fixture {
	f := newFixture(t)
	opts := f.opts
	opts.Now = func() int64 { return clock() + 60000 }
	f.write(f.aStore, v2)
	_, err := syncer.Push(f.ctx, f.first, opts)
	must(t, err)
	f.pull(f.second)
	f.write(f.state(f.second).Links[0].Store, v3)
	opts.Now = func() int64 { return clock() + 120000 }
	_, err = syncer.Push(f.ctx, f.second, opts)
	must(t, err)
	f.pull(f.first)
	return f
}
func (f *fixture) history(a contracts.Adapters, cwd string, fetch client.Fetch) hl.Result {
	r, err := hl.FileHistory(f.ctx, a, hl.Options{Selection: hf.Selection{Cwd: cwd}, Now: clock, Fetcher: fetch})
	must(f.t, err)
	return r
}
func noValues(t *testing.T, text string) {
	t.Helper()
	for _, secret := range []string{"local-test-value", "secret-db-v2", "rotated-secret-v3"} {
		if strings.Contains(text, secret) {
			t.Fatal("history leaked value")
		}
	}
}
func TestHistoryVersionsDevicesAndKeysOnly(t *testing.T) {
	f := threeVersions(t)
	r := f.history(f.first, f.checkout.Root, nil)
	equal(t, len(r.Files), 1)
	file := r.Files[0]
	equal(t, file.Pruned, false)
	equal(t, len(file.Checkouts), 1)
	equal(t, file.Checkouts[0].Root, f.checkout.Root)
	equal(t, *file.Checkouts[0].Version, uint64(3))
	versions := expectedHistoryVersions()
	if !reflect.DeepEqual(file.Versions, versions) {
		t.Fatal(file.Versions, versions)
	}
	text := hl.HistoryText(r, clock(), "")
	if !strings.Contains(text, "v3") || !strings.Contains(text, "<- current") {
		t.Fatal(text)
	}
	if !strings.Contains(hl.HistoryText(r, clock(), "Asia/Kolkata"), "GMT+5:30") {
		t.Fatal("missing zone")
	}
	raw, err := json.Marshal(r)
	must(t, err)
	noValues(t, text+string(raw))
}
func TestRestoreThenPushPublishesHistory(t *testing.T) {
	f := threeVersions(t)
	opts := hr.Options{Cwd: f.checkout.Root, File: ".env", Version: 1, Interactive: true, Now: clock}
	prompts := []string{}
	opts.Confirm = func(message string) (bool, error) { prompts = append(prompts, message); return false, nil }
	r, err := hr.RestoreVersion(f.ctx, f.first, opts)
	must(t, err)
	equal(t, r.Kind, "cancelled")
	if len(prompts) == 0 || !strings.Contains(prompts[0], "TOKEN") {
		t.Fatal(prompts)
	}
	noValues(t, strings.Join(prompts, "\n"))
	opts.Interactive = false
	opts.Yes = true
	_, err = hr.RestoreVersion(f.ctx, f.first, opts)
	if !e.Is(err, e.InvalidInput) {
		t.Fatal(err)
	}
	opts.Interactive = true
	opts.Confirm = func(string) (bool, error) { return true, nil }
	r, err = hr.RestoreVersion(f.ctx, f.first, opts)
	must(t, err)
	equal(t, r.Kind, "restored")
	equal(t, r.Version, uint64(1))
	if !reflect.DeepEqual(r.Changes, hl.KeyChanges{Added: []string{}, Changed: []string{"TOKEN"}, Removed: []string{"DB_URL"}}) {
		t.Fatal(r.Changes)
	}
	raw, err := json.Marshal(r)
	must(t, err)
	noValues(t, hr.RestoreText(r)+string(raw))
	equal(t, f.read(f.aStore), original)
	local := f.history(f.first, f.checkout.Root, nil).Files[0]
	equal(t, len(local.Versions), 3)
	for i, v := range local.Versions {
		equal(t, v.Version, uint64(3-i))
	}
	equal(t, *local.Checkouts[0].Version, uint64(1))
	push := f.opts
	push.Now = func() int64 { return clock() + 180000 }
	_, err = syncer.Push(f.ctx, f.first, push)
	must(t, err)
	published := f.history(f.first, f.checkout.Root, nil).Files[0]
	equal(t, published.Versions[0].Version, uint64(4))
	equal(t, published.Versions[0].Device, "first")
	equal(t, *published.Checkouts[0].Version, uint64(4))
}
func TestPrunedHistoryEndsAtMissingListsAndBlobs(t *testing.T) {
	f := threeVersions(t)
	blobs, lists := []string{}, []string{}
	recording := func(req *http.Request) (*http.Response, error) {
		path := req.URL.Path
		if strings.HasPrefix(path, "/v1/blobs/") {
			blobs = append(blobs, path)
		}
		if strings.HasPrefix(path, "/v1/files/") {
			lists = append(lists, path)
		}
		return client.DefaultFetch(req)
	}
	f.history(f.second, f.checkoutB.Root, recording)
	missing := func(paths []string) client.Fetch {
		return func(req *http.Request) (*http.Response, error) {
			for _, path := range paths {
				if path == req.URL.Path {
					return &http.Response{StatusCode: 404, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("{\"error\":\"NOT_FOUND\"}"))}, nil
				}
			}
			return client.DefaultFetch(req)
		}
	}
	without := f.history(f.second, f.checkoutB.Root, missing([]string{blobs[len(blobs)-1]})).Files[0]
	equal(t, without.Pruned, true)
	equal(t, len(without.Versions), 2)
	equal(t, without.Versions[0].Version, uint64(3))
	equal(t, without.Versions[1].Version, uint64(2))
	equal(t, without.Versions[1].Device, "first")
	equal(t, without.Versions[1].Changes.(string), "unknown")
	head := f.history(f.second, f.checkoutB.Root, missing(lists[1:]))
	want := []hl.Version{{Version: 3, Kind: "live", Changes: "unknown"}}
	if !reflect.DeepEqual(head.Files[0].Versions, want) {
		t.Fatal(head.Files[0].Versions)
	}
	if !strings.Contains(hl.HistoryText(head, clock(), ""), "older versions pruned") {
		t.Fatal("pruning not reported")
	}
}
