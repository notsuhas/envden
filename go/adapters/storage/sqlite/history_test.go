package sqlite

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	"os"
	"testing"
)

func historySwap(i int, versions []a.FileVersion) a.StoredSwap {
	s := storedSwap(i, versions)
	s.Header.Hash = b(i)
	s.Header.Bytes = b(i)
	s.BodyDigest = b(i)
	s.Files.Hash = b(i)
	s.Files.Bytes = b(i)
	return s
}

func TestUnchangedVersionsDoNotPinEveryList(t *testing.T) {
	db := open(t, t.TempDir())
	for i := 1; i <= 3; i++ {
		check(t, db.PutBlob(b(1), b(i), b(i), nil, 0, 0))
		var expected []byte
		if i > 1 {
			expected = b(i - 1)
		}
		_, err := db.CommitSwap(b(1), expected, historySwap(i, []a.FileVersion{{FileID: b(1), Version: 1, BlobHash: b(1)}, {FileID: b(2), Version: uint64(i), BlobHash: b(i)}}), int64(i))
		check(t, err)
	}
	r, err := db.Prune(b(1), a.HistoryPolicy{MinVersions: 1}, 4)
	check(t, err)
	if r.Lists != 1 || r.Blobs != 1 {
		t.Fatal(r)
	}
	if _, err = os.Stat(db.blobPath(b(1), b(2))); !os.IsNotExist(err) {
		t.Fatal("blob retained")
	}
	if err = db.Transaction(func() error { _, err := db.Prune(b(1), a.HistoryPolicy{MinVersions: 1}, 4); return err }); err == nil {
		t.Fatal("pruning ran inside transaction")
	}
}

func TestRestoredCurrentListStaysPinned(t *testing.T) {
	db := open(t, t.TempDir())
	_, err := db.CommitSwap(b(1), nil, historySwap(1, []a.FileVersion{{FileID: b(1), Version: 1, BlobHash: b(1)}}), 1)
	check(t, err)
	s := historySwap(2, nil)
	files := *s.Files
	files.Versions = []a.FileVersion{{FileID: b(1), Version: 2, BlobHash: b(2)}}
	s.Files = nil
	s.Vault = nil
	s.FilesHash = b(2)
	_, err = db.CommitSwap(b(1), b(1), s, 2)
	check(t, err)
	check(t, db.PutFileList(b(1), files, 2))
	r, err := db.Prune(b(1), a.HistoryPolicy{MinVersions: 1}, 4)
	check(t, err)
	if r.Lists != 1 {
		t.Fatal(r)
	}
	if b, err := db.FileList(b(1), b(2)); err != nil || b == nil {
		t.Fatal(b, err)
	}
	headers, err := db.HeadersForFiles(b(1), b(1))
	check(t, err)
	if len(headers) != 2 {
		t.Fatal(headers)
	}
}

func TestKeptListDoesNotKeepPrunedBlobs(t *testing.T) {
	db := open(t, t.TempDir())
	check(t, db.PutBlob(b(1), b(200), b(200), nil, 0, 0))
	for i := 1; i <= 32; i++ {
		version := i - 1
		if i <= 2 {
			version = 1
		}
		if i != 2 {
			check(t, db.PutBlob(b(1), b(100+version), b(100+version), nil, 0, 0))
		}
		other := a.FileVersion{FileID: b(2), Version: 2, Tombstone: true}
		if i == 1 {
			other = a.FileVersion{FileID: b(2), Version: 1, BlobHash: b(200)}
		}
		var expected []byte
		if i > 1 {
			expected = b(i - 1)
		}
		_, err := db.CommitSwap(b(1), expected, historySwap(i, []a.FileVersion{{FileID: b(1), Version: uint64(version), BlobHash: b(100 + version)}, other}), int64(i))
		check(t, err)
	}
	_, err := db.Prune(b(1), a.HistoryPolicy{MinVersions: 20}, 40)
	check(t, err)
	for _, i := range []int{101, 111} {
		blob, err := db.GetBlob(b(1), b(i))
		check(t, err)
		if blob != nil {
			t.Fatal("pruned blob retained", i)
		}
	}
	for _, i := range []int{112, 200} {
		blob, err := db.GetBlob(b(1), b(i))
		check(t, err)
		if string(blob) != string(b(i)) {
			t.Fatal(i, blob)
		}
	}
}
