package reconciliation

import (
	"bytes"
	"context"
	"path/filepath"
	"testing"

	placementfs "github.com/notsuhas/envden/go/adapters/placement/fs"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	state "github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
	fakeplace "github.com/notsuhas/envden/go/testing/placement"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
)

type reconciliationFixture struct {
	context  *syncmodel.Context
	targets  []state.Link
	store    string
	previous manifests.FileEntry
}

func newReconciliationFixture(t *testing.T, modes []string) *reconciliationFixture {
	t.Helper()
	home := t.TempDir()
	clock := func() int64 { return 1700000000000 }
	a := contracts.Adapters{Home: home, Now: clock, Repo: fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{EnsureIgnored: func(adapters.Checkout, string) error { return nil }})}
	a.Placement = func(mode adapters.PlacementMode, root string) adapters.Placement {
		real := placementfs.CreateFsPlacementAdapter(mode, root, filepath.Join(home, "placement-backups"), clock)

		return fakeplace.CreateFakePlacementAdapter(fakeplace.Operations{Mode: mode, Inspect: real.Inspect, Remove: real.Remove, Place: func(store, destination string, _ func(string) error, replacing *string) error {
			return real.Place(store, destination, func(string) error { return nil }, replacing)
		}})
	}
	header := manifests.ManifestHeader{VaultId: make([]byte, 32), Prev: make([]byte, 32), ListHead: make([]byte, 32), KeyringHash: make([]byte, 32), FilesHash: make([]byte, 32), EnvelopeHash: make([]byte, 32), Signer: make([]byte, 16)}
	sc := &syncmodel.Context{Context: context.Background(), Adapters: a, Options: syncmodel.Options{Now: clock, Yes: true}, State: state.EmptyState("fixture"), VaultID: bytes.Repeat([]byte{1}, 32), Keys: map[int][]byte{1: bytes.Repeat([]byte{2}, 32)}, Checkpoint: chain.Checkpoint{Header: encoding.Signed[manifests.ManifestHeader]{Body: header, Signature: make([]byte, 64)}, IdKey: bytes.Repeat([]byte{3}, 32)}}
	sc.Links.ApprovedCheckout = func(_ adapters.Repo, _ *state.State, root string) (*adapters.Checkout, error) {
		return &adapters.Checkout{Root: root}, nil
	}
	fixture := &reconciliationFixture{context: sc, store: filepath.Join(home, "store", ".env")}
	fixture.previous = fixture.seal(t, 1, []byte("TOKEN=A\n"))
	if err := localfiles.WriteBytes(fixture.store, []byte("TOKEN=A\n"), clock); err != nil {
		t.Fatal(err)
	}

	base := localfiles.BasePath(home, fixture.store)
	if err := statefiles.AtomicWrite(base+".entry", []byte(client.Text(manifests.FileEntryCodec.Write(fixture.previous))), clock); err != nil {
		t.Fatal(err)
	}
	if err := localfiles.WriteBytes(base, []byte("TOKEN=A\n"), clock); err != nil {
		t.Fatal(err)
	}

	for _, mode := range modes {
		root := t.TempDir()
		target := state.Link{Root: root, Path: ".env", Store: fixture.store, Mode: mode}
		if err := a.Placement(adapters.PlacementMode(mode), root).Place(fixture.store, filepath.Join(root, ".env"), nil, nil); err != nil {
			t.Fatal(err)
		}

		if mode == "copy" {
			if err := localfiles.WriteBytes(localfiles.BasePath(home, fixture.store, root), []byte("TOKEN=A\n"), clock); err != nil {
				t.Fatal(err)
			}
		}

		fixture.targets = append(fixture.targets, target)
	}

	sc.State.Links = append([]state.Link{}, fixture.targets...)

	return fixture
}

func (fxt *reconciliationFixture) seal(t *testing.T, version uint64, value []byte) manifests.FileEntry {
	t.Helper()
	sc := fxt.context
	id, err := protocolfiles.FileID(sc.Checkpoint.IdKey, "example/repo", ".env")
	if err != nil {
		t.Fatal(err)
	}

	ctx := protocolfiles.FileContext{VaultId: sc.VaultID, Epoch: 1, Version: version, FileId: id}
	name, err := protocolfiles.SealFileName(content.FileName{RepoId: "example/repo", Path: ".env"}, sc.Keys[1], ctx)
	if err != nil {
		t.Fatal(err)
	}

	entry := manifests.FileEntry{FileId: id, Epoch: 1, Version: version, State: 2, Name: name, BlobHash: make([]byte, 32)}

	if value != nil {
		blob, err := protocolfiles.SealFile(content.File{RepoId: "example/repo", Path: ".env", Content: value}, sc.Keys[1], ctx)
		if err != nil {
			t.Fatal(err)
		}

		entry.State = 1
		entry.BlobHash = crypto.H("blob", blob)
		if err := statefiles.AtomicWrite(filepath.Join(sc.Adapters.Home, "state", "blobs", client.Text(entry.BlobHash)), blob, sc.Options.Now); err != nil {
			t.Fatal(err)
		}
	}

	return entry
}
