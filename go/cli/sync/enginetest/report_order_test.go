package enginetest

import (
	"errors"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/sync/local/reconcile"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func TestSkippedFilesReportedBeforePlacement(t *testing.T) {
	f := newFixture(t)
	c, err := remote.SyncContext(f.ctx, f.first, f.opts, syncLinks(f))
	must(t, err)
	entries := []manifests.FileEntry{}
	for _, path := range []string{".env", ".env.example"} {
		id, err := protocolfiles.FileID(c.Checkpoint.IdKey, f.checkout.RepoID, path)
		must(t, err)
		entry, err := remote.SealUpload(c, f.checkout.RepoID, path, id, nil, []byte("TOKEN=new\n"))
		must(t, err)
		entries = append(entries, entry)
	}
	c.Checkpoint.Files.Entries = entries
	reports := []string{}
	c.Options.Report = func(s string) { reports = append(reports, s) }
	c.Options.AtomicWrite = func(string, []byte) error { return errors.New("fixture placement failure") }
	_, _ = reconcile.Reconcile(c, map[string]bool{f.checkout.RepoID: true}, nil, nil)
	if len(reports) < 2 || reports[0] != "Skipped env file: .env.example" || !strings.HasPrefix(reports[1], "Could not place env file") {
		t.Fatal(reports)
	}
}
