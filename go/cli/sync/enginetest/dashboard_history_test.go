package enginetest

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	historylist "github.com/notsuhas/envden/go/cli/history/list"
	syncer "github.com/notsuhas/envden/go/cli/sync"
)

func jsonEqual(t *testing.T, got, want any) {
	t.Helper()
	raw, err := json.Marshal(want)
	must(t, err)
	var value any
	must(t, json.Unmarshal(raw, &value))

	if !reflect.DeepEqual(got, value) {
		t.Fatal(got, value)
	}
}

func historyQuery(root string) string {
	return "/api/history?" + url.Values{"root": {root}, "path": {".env"}}.Encode()
}

func restoreBody(root string, version any) map[string]any {
	return map[string]any{"root": root, "path": ".env", "version": version}
}

func TestDashboardHistoryVersions(t *testing.T) {
	f := threeVersions(t)
	c := dashboardClient{f: f}
	r := c.send(f.first, historyQuery(f.checkout.Root), nil, nil)
	equal(t, r.Code, 200)
	history := c.object(r)
	equal(t, history["repoId"], any(f.checkout.RepoID))
	equal(t, history["path"], any(".env"))
	equal(t, history["pruned"], any(false))
	jsonEqual(t, history["checkouts"], []map[string]any{{"root": f.checkout.Root, "version": 3}})
	jsonEqual(t, history["versions"], expectedHistoryVersions())
	c.noValues("local-test-value", "secret-db-v2", "rotated-secret-v3", "detached-secret")
}

func TestDashboardHistoryInputs(t *testing.T) {
	for _, tc := range []struct {
		name  string
		query url.Values
	}{
		{"no path", url.Values{"root": {"/tmp/x"}}}, {"a relative root", url.Values{"root": {"checkout"}, "path": {".env"}}}, {"an extra field", url.Values{"root": {"/tmp/x"}, "path": {".env"}, "version": {"1"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			c := dashboardClient{f: f}
			r := c.send(f.first, "/api/history?"+tc.query.Encode(), nil, nil)
			equal(t, r.Code, 400)
			equal(t, c.object(r)["error"], any("INVALID_INPUT"))
		})
	}
}

func TestDashboardRestoreInputs(t *testing.T) {
	for _, tc := range []struct {
		name    string
		version any
	}{{"no version", nil}, {"version zero", 0}, {"a fractional version", 1.5}} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			c := dashboardClient{f: f}
			body := restoreBody(f.checkout.Root, tc.version)

			if tc.version == nil {
				delete(body, "version")
			}

			r := c.send(f.first, "/api/history/restore", nil, body)
			equal(t, r.Code, 400)
			equal(t, c.object(r)["error"], any("INVALID_INPUT"))
		})
	}
}

func TestDashboardRestoreWaitsForPush(t *testing.T) {
	f := threeVersions(t)
	c := dashboardClient{f: f}
	store := f.state(f.second).Links[0].Store
	r := c.send(f.first, "/api/history/restore", nil, restoreBody(f.checkout.Root, 1))
	equal(t, r.Code, 200)
	restored := c.object(r)
	equal(t, restored["kind"], any("restored"))
	equal(t, restored["path"], any(filepath.Join(f.checkout.Root, ".env")))
	equal(t, restored["version"], any(float64(1)))
	jsonEqual(t, restored["changes"], historylist.KeyChanges{Added: []string{}, Changed: []string{"TOKEN"}, Removed: []string{"DB_URL"}})
	equal(t, f.read(f.aStore), original)
	equal(t, dashboardFile(c.get(f.first, "/api/status"))["status"], any("local-changes"))
	history := c.get(f.first, historyQuery(f.checkout.Root))
	versions := array(history["versions"])
	equal(t, len(versions), 3)

	for i, v := range versions {
		equal(t, object(v)["version"], any(float64(3-i)))
	}

	equal(t, object(array(history["checkouts"])[0])["version"], any(float64(1)))
	equal(t, f.pull(f.second).Changed, 0)
	equal(t, f.read(store), v3)
	r = c.send(f.first, "/api/history/restore", nil, restoreBody(f.checkout.Root, 1))
	equal(t, r.Code, 200)
	equal(t, c.object(r)["kind"], any("unchanged"))
	equal(t, c.object(r)["version"], any(float64(1)))
	c.noValues("local-test-value", "secret-db-v2", "rotated-secret-v3", "detached-secret")
}

func TestDashboardRestoreRefusalsPreserveFiles(t *testing.T) {
	f := threeVersions(t)
	c := dashboardClient{f: f}
	store := f.state(f.second).Links[0].Store
	r := c.send(f.first, "/api/history/restore", nil, restoreBody(f.checkout.Root, 9))
	equal(t, r.Code, 404)
	f.write(store, v3+"NEW=local-test-value\n")
	f.remove(f.first, filepath.Join(f.checkout.Root, ".env"))
	opts := f.opts
	opts.Now = func() int64 { return clock() + 180000 }
	_, err := syncer.Push(f.ctx, f.first, opts)
	must(t, err)
	r = c.send(f.second, "/api/history/restore", nil, restoreBody(f.checkoutB.Root, 4))
	equal(t, r.Code, 400)

	if !strings.Contains(c.object(r)["message"].(string), "deleted") {
		t.Fatal(r.Body.String())
	}

	path := filepath.Join(f.checkoutB.Root, ".env")
	must(t, os.Remove(path))
	f.write(path, "TOKEN=detached-secret\n")
	r = c.send(f.second, "/api/history/restore", nil, restoreBody(f.checkoutB.Root, 1))
	equal(t, r.Code, 409)
	equal(t, f.read(path), "TOKEN=detached-secret\n")
	state := f.state(f.second)
	state.Links[0].LocalOnly = true
	f.save(f.second, state)
	r = c.send(f.second, "/api/history/restore", nil, restoreBody(f.checkoutB.Root, 1))
	equal(t, r.Code, 400)
	equal(t, f.read(store), v3+"NEW=local-test-value\n")
	c.noValues("local-test-value", "secret-db-v2", "rotated-secret-v3", "detached-secret")
}
