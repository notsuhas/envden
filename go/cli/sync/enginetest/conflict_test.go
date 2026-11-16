package enginetest

import (
	"encoding/json"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"path/filepath"
	"strings"
	"testing"
)

func TestSyncConflict(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	b := f.state(f.second).Links[0].Store
	f.pull(f.first)
	f.write(f.aStore, "TOKEN=local-test-value\nA=remote\nB=one\n")
	f.write(b, "TOKEN=local-test-value\nA=mine\nB=one\n")
	d, err := syncer.Diff(f.ctx, f.second, f.opts)
	must(t, err)
	data, err := json.Marshal(d)
	must(t, err)
	if strings.Contains(string(data), "local-test-value") {
		t.Fatal("diff leaked value")
	}
	f.push(f.first)
	equal(t, f.pull(f.second).Conflicts, 1)
	if !strings.Contains(f.read(b), "A=mine") {
		t.Fatal("lost mine")
	}
	records, err := local.ConflictRecords(f.second.Home)
	must(t, err)
	equal(t, len(records), 1)
	equal(t, f.read(records[0].File), "TOKEN=local-test-value\n<<<<<<< this device\nA=mine\n=======\nA=remote\n>>>>>>> server (from first)\nB=one\n")
	_, err = syncer.ResolveConflict(f.ctx, f.second, syncer.ResolveOptions{File: ".env", Choice: "edit", Now: clock})
	if err == nil || !strings.HasPrefix(err.Error(), "Conflict markers are still in") {
		t.Fatal(err)
	}
	f.resolve(f.second, ".env", "take-server")
	if !strings.Contains(f.read(b), "A=remote") {
		t.Fatal("resolution missing remote")
	}
}

func TestUnpublishedDetachedConflict(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(f.checkout.Root, ".env.local")
	f.write(path, "KEY=original\n")
	f.track(&f.first, f.checkout, false, ".env.local")
	f.write(path, "KEY=detached\n")
	f.write(f.aStore, "TOKEN=other-change\n")
	r := f.push(f.first)
	equal(t, r.Conflicts, 1)
	equal(t, r.Changed, 1)
	records, err := local.ConflictRecords(f.first.Home)
	must(t, err)
	equal(t, len(records), 1)
	equal(t, f.read(records[0].Mine), "KEY=original\n")
	found := false
	for _, p := range records[0].Alternatives {
		if f.read(p) == "KEY=detached\n" {
			found = true
		}
	}
	if !found {
		t.Fatal("missing detached alternative")
	}
	f.resolve(f.first, ".env.local", "keep-mine")
	equal(t, f.push(f.first).Conflicts, 0)
	f.pull(f.second)
	equal(t, f.read(filepath.Join(f.checkoutB.Root, ".env.local")), "KEY=original\n")
}
