package storage

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"testing"
)

func BlobStagingContract(t *testing.T, db a.Storage) {
	must(db.ConfigureVault(b(1), a.StoredVault{Active: true}, nil, nil))
	must(db.PutBlob(b(1), b(80), b(81), nil, 10, 1))
	equal(t, value(db.HasBlob(b(1), b(80))), true)
	equal(t, value(db.VaultUsage(b(1))), int64(1))
	equal(t, value(db.VaultUsage(b(2))), int64(0))
	if err := db.PutBlob(b(1), b(82), b(83), nil, 10, 1); !e.Is(err, "STORAGE_QUOTA") {
		t.Fatalf("expected quota error, got %v", err)
	}
	equal(t, value(db.Prune(b(1), a.HistoryPolicy{MinVersions: 1}, 86400010)).Blobs, 0)
	must(db.PutBlob(b(1), b(80), b(81), nil, 86400010, 1))
	equal(t, value(db.Prune(b(1), a.HistoryPolicy{MinVersions: 1}, 86400011)).Blobs, 0)
	equal(t, value(db.Prune(b(1), a.HistoryPolicy{MinVersions: 1}, 172800011)).Blobs, 1)
	equal(t, value(db.HasBlob(b(1), b(80))), false)
	equal(t, value(db.VaultUsage(b(1))), int64(0))
}
