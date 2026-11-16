package local

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
)

func TestAppliedLineage(t *testing.T) {
	home := t.TempDir()
	clock := func() int64 { return 1700000000000 }
	store := filepath.Join(home, "store", ".env")
	entry := manifests.FileEntry{FileId: bytes.Repeat([]byte{1}, 32), Version: 1, Epoch: 1, State: 2, BlobHash: make([]byte, 32), Name: []byte{}}
	encoded := base64.RawURLEncoding.EncodeToString(manifests.FileEntryCodec.Write(entry))
	if err := MarkAppliedEntry(home, encoded, store, clock); err != nil {
		t.Fatal(err)
	}

	applied, err := AppliedFiles(home)
	if err != nil || !HasAppliedEntry(entry, applied) {
		t.Fatal(applied, err)
	}

	value, err := localfiles.ReadBytes(localfiles.BasePath(home, store) + ".entry")
	if err != nil || string(value) != encoded {
		t.Fatal(string(value), err)
	}

	entry.Version++

	if HasAppliedEntry(entry, applied) {
		t.Fatal("new version accepted without application")
	}

	path := filepath.Join(home, "state", "applied-files.json")
	if err = statefiles.AtomicWrite(path, []byte(`{"file":"not-an-entry"}`), clock); err != nil {
		t.Fatal(err)
	}

	if _, err = AppliedFiles(home); !envdenerrors.Is(err, envdenerrors.InvalidData) {
		t.Fatal(err)
	}

	if raw, err := os.ReadFile(path); err != nil || string(raw) != `{"file":"not-an-entry"}` {
		t.Fatal("read changed corrupt state", err)
	}
}
