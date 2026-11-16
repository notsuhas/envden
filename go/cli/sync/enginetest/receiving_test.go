package enginetest

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	storepath "github.com/notsuhas/envden/go/cli/store"
	"github.com/notsuhas/envden/go/cli/sync/local/reconcile"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/adapters"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
)

func TestReceiverFiltersUnsafeNames(t *testing.T) {
	f := newFixture(t)
	reports := []string{}
	opts := f.opts
	opts.Report = func(v string) { reports = append(reports, v) }
	repo := f.second.Repo
	f.second.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: repo.CheckoutAt, CaseInsensitive: func(string, bool) (bool, error) { return true, nil }, EnsureIgnored: func(_ adapters.Checkout, path string) error {
		if path == ".env.bad" {
			return envdenerrors.New(envdenerrors.InvalidInput, "Tracked env file")
		}

		return nil
	}})
	context, err := remote.SyncContext(f.ctx, f.second, opts, syncLinks(f))
	must(t, err)
	repoID := f.checkout.RepoID

	for _, path := range []string{".env.bad", ".env.good", ".env.COLLISION", ".env.collision", ".envrc", ".npmrc", "node_modules/.env"} {
		id, err := protocolfiles.FileID(context.Checkpoint.IdKey, repoID, path)
		must(t, err)
		entry, err := remote.SealUpload(context, repoID, path, id, nil, []byte("KEY=test\n"))
		must(t, err)
		context.Checkpoint.Files.Entries = append(context.Checkpoint.Files.Entries, entry)
	}

	result, err := reconcile.Reconcile(context, map[string]bool{repoID: true}, nil, nil)
	must(t, err)
	equal(t, result.Conflicts, 2)

	if !strings.Contains(strings.Join(reports, "\n"), "(INVALID_INPUT): .env.bad") {
		t.Fatal(reports)
	}

	for _, path := range []string{".env.bad", ".env.collision"} {
		store, err := storepath.StorePath(f.second.Home, repoID, path)
		must(t, err)
		equal(t, result.FailedStores[store], true)
	}

	equal(t, readValue(filepath.Join(f.checkoutB.Root, ".env.good")).present, true)

	for _, path := range []string{".envrc", ".npmrc", "node_modules/.env"} {
		equal(t, readValue(filepath.Join(f.checkoutB.Root, path)).present, false)

		if !strings.Contains(strings.Join(reports, "\n"), path) {
			t.Fatal("unreported unsafe path", path)
		}
	}
}

func TestPushCannotUploadFailedRemoteChange(t *testing.T) {
	for _, reason := range []string{"refused", "failed", "conflicted"} {
		t.Run(reason, func(t *testing.T) {
			f := newFixture(t)
			f.pull(f.second)
			store := f.state(f.second).Links[0].Store
			f.write(f.aStore, "TOKEN=remote\n")
			f.push(f.first)

			if reason == "conflicted" {
				f.write(store, "TOKEN=mine\n")
			} else {
				repo := f.second.Repo
				f.second.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: repo.CheckoutAt, CaseInsensitive: repo.CaseInsensitive, EnsureIgnored: func(adapters.Checkout, string) error {
					if reason == "refused" {
						return envdenerrors.New(envdenerrors.InvalidInput, "Refused placement")
					}

					return errors.New("injected placement failure")
				}})
			}

			equal(t, f.push(f.second).Conflicts, 1)
			f.pull(f.first)
			equal(t, f.read(f.aStore), "TOKEN=remote\n")
		})
	}
}
