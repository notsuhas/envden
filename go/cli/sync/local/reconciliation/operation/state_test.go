package operation

import (
	"bytes"
	"context"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	sf "github.com/notsuhas/envden/go/cli/state/files"
	state "github.com/notsuhas/envden/go/cli/state/model"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	pf "github.com/notsuhas/envden/go/core/protocol/files"
)

func fileFixture(t *testing.T) (*sm.Context, string, m.FileEntry) {
	t.Helper()
	home := t.TempDir()
	clock := func() int64 { return 1700000000000 }
	key := bytes.Repeat([]byte{1}, 32)
	idKey := bytes.Repeat([]byte{2}, 32)
	vault := bytes.Repeat([]byte{3}, 32)
	id, err := pf.FileID(idKey, "example/repo", ".env")
	if err != nil {
		t.Fatal(err)
	}
	ctx := pf.FileContext{VaultId: vault, Epoch: 1, Version: 1, FileId: id}
	name, err := pf.SealFileName(d.FileName{RepoId: "example/repo", Path: ".env"}, key, ctx)
	if err != nil {
		t.Fatal(err)
	}
	blob, err := pf.SealFile(d.File{RepoId: "example/repo", Path: ".env", Content: []byte("TOKEN=server\n")}, key, ctx)
	if err != nil {
		t.Fatal(err)
	}
	hash := cr.H("blob", blob)
	if err = sf.AtomicWrite(filepath.Join(home, "state", "blobs", client.Text(hash)), blob, clock); err != nil {
		t.Fatal(err)
	}
	entry := m.FileEntry{FileId: id, Version: 1, Epoch: 1, State: 1, BlobHash: hash, Name: name}
	sc := &sm.Context{Context: context.Background(), Adapters: contracts.Adapters{Home: home, Now: clock}, State: state.EmptyState("fixture"), Options: sm.Options{Now: clock}, Keys: map[int][]byte{1: key}, VaultID: vault, Checkpoint: chain.Checkpoint{IdKey: idKey}}

	return sc, filepath.Join(home, "store", ".env"), entry
}

func TestFileStateDeletionAndRestoration(t *testing.T) {
	for _, scenario := range []string{"missing", "pending removal", "restored removal", "moved head", "tombstone", "corrupt ancestor"} {
		t.Run(scenario, func(t *testing.T) {
			sc, store, entry := fileFixture(t)
			home, now := sc.Adapters.Home, sc.Options.Now
			encoded := client.Text(m.FileEntryCodec.Write(entry))
			base := f.BasePath(home, store)
			if err := sf.AtomicWrite(base+".entry", []byte(encoded), now); err != nil {
				t.Fatal(err)
			}
			if scenario != "missing" && scenario != "corrupt ancestor" {
				if err := RequestDeletion(home, store, true, &encoded, []string{}, now); err != nil {
					t.Fatal(err)
				}
			}
			switch scenario {
			case "restored removal":
				if err := f.WriteBytes(store, []byte("TOKEN=restored\n"), now); err != nil {
					t.Fatal(err)
				}
			case "moved head":
				entry.Version++
			case "tombstone":
				entry.State = 2
				entry.BlobHash = make([]byte, 32)
			case "corrupt ancestor":
				if err := sf.AtomicWrite(base+".entry", []byte("invalid"), now); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "moved head" {
				// The name is authenticated with the version, so keep a valid new name.
				name, err := pf.SealFileName(d.FileName{RepoId: "example/repo", Path: ".env"}, sc.Keys[1], pf.FileContext{VaultId: sc.VaultID, Epoch: 1, Version: entry.Version, FileId: entry.FileId})
				if err != nil {
					t.Fatal(err)
				}
				blob, err := pf.SealFile(d.File{RepoId: "example/repo", Path: ".env", Content: []byte("TOKEN=new\n")}, sc.Keys[1], pf.FileContext{VaultId: sc.VaultID, Epoch: 1, Version: entry.Version, FileId: entry.FileId})
				if err != nil {
					t.Fatal(err)
				}
				entry.Name = name
				entry.BlobHash = cr.H("blob", blob)
				if err = sf.AtomicWrite(filepath.Join(home, "state", "blobs", client.Text(entry.BlobHash)), blob, now); err != nil {
					t.Fatal(err)
				}
			}
			snapshot, err := ReadFileState(sc, nil, store, &entry)
			if err != nil {
				t.Fatal(err)
			}
			switch scenario {
			case "missing":
				if !snapshot.Restored || string(snapshot.Stored) != "TOKEN=server\n" {
					t.Fatal(snapshot)
				}
			case "pending removal":
				if !snapshot.Deleting || snapshot.Restored || snapshot.DeletionInvalid || snapshot.Stored != nil {
					t.Fatal(snapshot)
				}
			case "restored removal":
				if snapshot.Deleting || !snapshot.Reappeared || string(snapshot.Stored) != "TOKEN=restored\n" {
					t.Fatal(snapshot)
				}
			case "moved head":
				if !snapshot.Deleting || !snapshot.DeletionInvalid || snapshot.Restored {
					t.Fatal(snapshot)
				}
			case "tombstone":
				if snapshot.Deleting || snapshot.Stored != nil {
					t.Fatal(snapshot)
				}
			case "corrupt ancestor":
				if !snapshot.Corrupt || snapshot.Restored || snapshot.Encoded != nil {
					t.Fatal(snapshot)
				}
			}
		})
	}
}
