package storage

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
)

func BlobStagingContract(t *testing.T, db adapters.Storage) {
	must(db.ConfigureVault(b(1), adapters.StoredVault{Active: true}, nil, nil))
	must(db.PutBlob(b(1), b(80), b(81), nil, 10, 1))
	equal(t, value(db.HasBlob(b(1), b(80))), true)
	equal(t, value(db.VaultUsage(b(1))), int64(1))
	equal(t, value(db.VaultUsage(b(2))), int64(0))
	if err := db.PutBlob(b(1), b(82), b(83), nil, 10, 1); !enverrors.Is(err, "STORAGE_QUOTA") {
		t.Fatalf("expected quota error, got %v", err)
	}
	equal(t, value(db.Prune(b(1), adapters.HistoryPolicy{MinVersions: 1}, 86400010)).Blobs, 0)
	must(db.PutBlob(b(1), b(80), b(81), nil, 86400010, 1))
	equal(t, value(db.Prune(b(1), adapters.HistoryPolicy{MinVersions: 1}, 86400011)).Blobs, 0)
	equal(t, value(db.Prune(b(1), adapters.HistoryPolicy{MinVersions: 1}, 172800011)).Blobs, 1)
	equal(t, value(db.HasBlob(b(1), b(80))), false)
	equal(t, value(db.VaultUsage(b(1))), int64(0))
}
