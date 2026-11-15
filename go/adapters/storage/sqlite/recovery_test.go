package sqlite

import (
	"bytes"
	"encoding/hex"
	a "github.com/notsuhas/envden/go/core/adapters"
	"os"
	"path/filepath"
	"testing"
)

func TestRecovery(t *testing.T) {
	for _, scenario := range []string{"adopt", "delete", "preserve", "invalid", "temporary"} {
		t.Run(scenario, func(t *testing.T) {
			dir := t.TempDir()
			v := []byte{1}
			content := []byte{4, 5, 6}
			h := blobHash(content)
			path := filepath.Join(dir, "blobs", "01")
			check(t, os.MkdirAll(path, 0700))
			name := blobName(h)
			if scenario == "temporary" {
				name = ".tmp-fixture"
			}
			contents := content
			if scenario == "invalid" {
				contents = []byte{9}
			}
			check(t, os.WriteFile(filepath.Join(path, name), contents, 0600))
			if scenario == "delete" || scenario == "preserve" {
				first := open(t, dir)
				check(t, first.PutBlob(v, h, content, nil, 0, 0))
				if scenario == "delete" {
					first.run("DELETE FROM blobs; DELETE FROM blob_usage")
				}
				first.run("INSERT INTO blob_garbage VALUES(?,?)", v, h)
				check(t, first.Close())
			}
			db := open(t, dir)
			b, err := db.GetBlob(v, h)
			check(t, err)
			want := scenario == "adopt" || scenario == "preserve"
			if (b != nil) != want {
				t.Fatalf("recovery %s returned %v", scenario, b)
			}
			if want && !bytes.Equal(b, content) {
				t.Fatal("wrong blob")
			}
			if !want {
				if _, err = os.Lstat(filepath.Join(path, name)); !os.IsNotExist(err) {
					t.Fatal("unwanted file retained")
				}
			}
		})
	}
}

func TestGarbageRetriesFailedUnlink(t *testing.T) {
	db := open(t, t.TempDir())
	v, h := b(1), b(2)
	check(t, db.ConfigureVault(v, a.StoredVault{}, nil, nil))
	check(t, db.PutBlob(v, h, b(3), nil, 0, 0))
	path := db.blobPath(v, h)
	check(t, os.Remove(path))
	check(t, os.Mkdir(path, 0700))
	check(t, db.Transaction(func() error { return db.DiscardInactiveVault(v) }))
	if db.count("SELECT COUNT(*) FROM blob_garbage") != 1 {
		t.Fatal("failed unlink was not retained")
	}
	check(t, os.Remove(path))
	check(t, os.WriteFile(path, b(3), 0600))
	_, err := db.Prune(v, a.HistoryPolicy{MinVersions: 1}, 0)
	check(t, err)
	if db.count("SELECT COUNT(*) FROM blob_garbage") != 0 {
		t.Fatal("garbage was not retried")
	}
	if _, err = os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("garbage file remains")
	}
}

func TestBlobRecoveryHashVector(t *testing.T) {
	if got := hex.EncodeToString(blobHash([]byte{4, 5, 6})); got != "73bb395871b361f25d9758a2f06c8ab5c994d4befa96c1da5defd0ceb67a3d31" {
		t.Fatal(got)
	}
}
