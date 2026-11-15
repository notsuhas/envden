package memory_test

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/testing/storage"
	"github.com/notsuhas/envden/go/testing/storage/memory"
)

func TestContract(t *testing.T) {
	storage.StorageContract(t, func(t *testing.T) storage.Fixture {
		db := memory.CreateMemoryStorageAdapter()

		return storage.Fixture{Storage: db, Reopen: func() adapters.Storage { return db }}
	})
}
