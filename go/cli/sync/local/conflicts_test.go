package local

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/content"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
)

func TestConflictVariantsAndUserEdits(t *testing.T) {
	home := t.TempDir()
	clock := func() int64 { return 1700000000000 }
	store := filepath.Join(home, "store", ".env")
	sc := &syncmodel.Context{Adapters: contracts.Adapters{Home: home}, Options: syncmodel.Options{Now: clock}}
	target := conflictmodel.Record{Root: home, Path: ".env", Store: store, Mode: "copy", Base: localfiles.BasePath(home, store), Targets: []state.Link{{Root: home, Path: ".env", Store: store, Mode: "copy"}}}
	mine, server := []byte("TOKEN=mine\n"), []byte("TOKEN=server\n")
	if err := RecordConflict(sc, target, mine, content.Server{Kind: "live", Bytes: server}, []byte("TOKEN=before\n"), [][]byte{mine, server, mine, {}, nil}); err != nil {
		t.Fatal(err)
	}

	records, err := ConflictRecords(home)
	if err != nil || len(records) != 1 {
		t.Fatal(records, err)
	}

	record := records[0]

	if len(record.Alternatives) != 3 {
		t.Fatal(record.Alternatives)
	}

	for _, tc := range []struct {
		path  string
		value []byte
	}{{record.Mine, mine}, {record.Server, server}, {record.Remote, server}, {record.Alternatives[2], []byte{}}} {
		value, err := localfiles.ReadBytes(tc.path)
		if err != nil || !localfiles.Same(value, tc.value) {
			t.Fatal(tc.path, value, err)
		}
	}
	if err := localfiles.WriteBytes(record.File, []byte("TOKEN=edited\n"), clock); err != nil {
		t.Fatal(err)
	}
	if err := RecordConflict(sc, target, mine, content.Server{Kind: "tombstone"}, nil, nil); err != nil {
		t.Fatal(err)
	}

	if edited, err := localfiles.ReadBytes(record.File); err != nil || string(edited) != "TOKEN=edited\n" {
		t.Fatal(string(edited), err)
	}
	if err = SaveConflicts(home, records, clock); err != nil {
		t.Fatal(err)
	}

	if _, err = ConflictRecords(home); err != nil {
		t.Fatal(err)
	}
}

func TestBackupPreservesEmptyFiles(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, "empty")
	if err := os.WriteFile(path, []byte{}, 0600); err != nil {
		t.Fatal(err)
	}

	saved, err := Backup(home, path, 1700000000000)
	if err != nil || saved == "" {
		t.Fatal(saved, err)
	}

	bytes, err := localfiles.ReadBytes(saved)
	if err != nil || bytes == nil || len(bytes) != 0 {
		t.Fatal(bytes, err)
	}

	if saved, err = Backup(home, path+".missing", 1700000000000); err != nil || saved != "" {
		t.Fatal(saved, err)
	}
}
