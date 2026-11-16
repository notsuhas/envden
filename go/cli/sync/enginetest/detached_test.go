package enginetest

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/content"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/history"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func TestTemplateDetachedBytes(t *testing.T) {
	for _, detached := range []bool{true, false} {
		t.Run(map[bool]string{true: "detached", false: "equal"}[detached], func(t *testing.T) {
			f := newFixture(t)
			c := f.checkout
			c.Root = filepath.Join(f.root, "repo")
			c.GitDir = filepath.Join(c.Root, ".git")
			c.RepoID = "github.com/test/repo"
			f.repo(&f.first, []adapters.Checkout{c})
			context, err := remote.SyncContext(f.ctx, f.first, f.opts, syncLinks(f))
			must(t, err)
			context.State.Approved = append(context.State.Approved, checkout.ApprovalRecord(c))
			store := filepath.Join(f.first.Home, "store", "repo", ".env")
			target := state.Link{Root: c.Root, Path: ".env", Store: store, Mode: "link"}
			context.State.Links = append(context.State.Links, target)
			old, server := []byte("SECRET=old\n"), []byte("SECRET=remote\n")
			f.write(store, string(old))
			must(t, history.SaveBase(files.BasePath(f.first.Home, store), old, clock))
			initial := old

			if detached {
				initial = []byte("SECRET=example\n")
			}

			f.write(filepath.Join(c.Root, ".env.example"), string(initial))
			f.write(filepath.Join(c.Root, ".env"), string(initial))
			id, err := protocolfiles.FileID(context.Checkpoint.IdKey, c.RepoID, ".env")
			must(t, err)
			applied, err := remote.SealUpload(context, c.RepoID, ".env", id, nil, old)
			must(t, err)
			must(t, local.MarkAppliedEntry(f.first.Home, client.Text(manifests.FileEntryCodec.Write(applied)), "", clock))
			entry, err := remote.SealUpload(context, c.RepoID, ".env", id, &applied, server)
			must(t, err)
			r, err := reconciliation.ReconcileFile(context, []state.Link{target}, store, &entry, nil, nil)
			must(t, err)
			count := 0
			wantStore, wantPath := string(server), string(server)

			if detached {
				count = 1
				wantStore = string(old)
				wantPath = string(initial)
			}

			equal(t, r.Conflicts, count)
			equal(t, f.read(store), wantStore)
			equal(t, f.read(filepath.Join(c.Root, ".env")), wantPath)
			records, err := local.ConflictRecords(f.first.Home)
			must(t, err)
			equal(t, len(records), count)
		})
	}
}

func TestDeletionConflictShortReport(t *testing.T) {
	f := newFixture(t)
	reports := []string{}
	opts := f.opts
	opts.Report = func(v string) { reports = append(reports, v) }
	context, err := remote.SyncContext(f.ctx, f.first, opts, syncLinks(f))
	must(t, err)
	target := context.State.Links[0]
	copy := []byte("COPY")
	must(t, local.RecordConflict(context, conflictmodel.Record{Root: target.Root, Path: target.Path, Store: target.Store, Mode: target.Mode, Targets: []state.Link{target}, Base: files.BasePath(f.first.Home, target.Store)}, nil, content.Server{Kind: "live", Bytes: []byte("SERVER")}, nil, [][]byte{nil, []byte("SERVER"), copy}))
	records, err := local.ConflictRecords(f.first.Home)
	must(t, err)
	equal(t, len(records), 1)
	equal(t, records[0].MineDeleted, true)
	equal(t, f.read(records[0].Alternatives[len(records[0].Alternatives)-1]), "COPY")
	equal(t, len(reports), 1)

	if !strings.HasPrefix(reports[0], "Conflict in ") || !strings.Contains(reports[0], ".env: deleted here and") {
		t.Fatal(reports)
	}
}
