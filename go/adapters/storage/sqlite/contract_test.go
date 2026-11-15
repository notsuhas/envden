package sqlite_test

import (
	db "github.com/notsuhas/envden/go/adapters/storage/sqlite"
	a "github.com/notsuhas/envden/go/core/adapters"
	s "github.com/notsuhas/envden/go/testing/storage"
	"testing"
)

func TestContract(t *testing.T) {
	s.StorageContract(t, func(t *testing.T) s.Fixture {
		dir := t.TempDir()
		var current a.Storage
		open := func() a.Storage {
			v, err := db.CreateSqliteStorageAdapter(dir, 0)
			if err != nil {
				t.Fatal(err)
			}
			current = v
			return v
		}
		return s.Fixture{Storage: open(), Reopen: func() a.Storage {
			if err := current.Close(); err != nil {
				t.Fatal(err)
			}
			return open()
		}, Dispose: func() { current.Close() }}
	})
}
