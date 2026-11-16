package enginetest

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/status"
	"testing"
)

func TestStatusTracksEditsRemoteAdvanceAndSync(t *testing.T) {
	f := newFixture(t)
	report := func(a contracts.Adapters) status.Report {
		r, err := status.StatusReport(f.ctx, a, status.DefaultSources())
		must(t, err)
		return r
	}
	first := report(f.first)
	equal(t, first.Server, "reachable")
	if first.ServerChecked == nil || !*first.ServerChecked {
		t.Fatal(first)
	}
	equal(t, len(first.Files), 1)
	equal(t, first.Files[0].State, "in-sync")
	f.write(f.aStore, original+"NEW_KEY=x\n")
	changed := report(f.first)
	equal(t, len(changed.Files), 1)
	equal(t, changed.Files[0].Path, ".env")
	equal(t, changed.Files[0].State, "changed")
	if changed.Files[0].Keys == nil || len(changed.Files[0].Keys.Added) != 1 || changed.Files[0].Keys.Added[0] != "NEW_KEY" {
		t.Fatal(changed)
	}
	remote := report(f.second)
	equal(t, len(remote.Files), 1)
	equal(t, remote.Files[0].Root, f.checkoutB.Root)
	equal(t, remote.Files[0].Path, ".env")
	equal(t, remote.Files[0].State, "remote")
	f.push(f.first)
	equal(t, report(f.first).Files[0].State, "in-sync")
	equal(t, report(f.second).Files[0].State, "remote")
	f.pull(f.second)
	equal(t, report(f.second).Files[0].State, "in-sync")
}
