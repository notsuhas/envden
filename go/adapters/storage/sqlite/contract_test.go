package sqlite_test

import (
	"testing"

	adaptersstoragesqlite "github.com/notsuhas/envden/go/adapters/storage/sqlite"
	coreadapters "github.com/notsuhas/envden/go/core/adapters"
	testingstorage "github.com/notsuhas/envden/go/testing/storage"
)

func TestContract(t *testing.T) {
	testingstorage.StorageContract(t, func(t *testing.T) testingstorage.Fixture {
		dir := t.TempDir()
		var current coreadapters.Storage
		open := func() coreadapters.Storage {
			v, err := adaptersstoragesqlite.CreateSqliteStorageAdapter(dir, 0)
			if err != nil {
				t.Fatal(err)
			}
			current = v

			return v
		}

		return testingstorage.Fixture{Storage: open(), Reopen: func() coreadapters.Storage {
			if err := current.Close(); err != nil {
				t.Fatal(err)
			}

			return open()
		}, Dispose: func() { _ = current.Close() }}
	})
}
