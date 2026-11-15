package memory_test

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	s "github.com/notsuhas/envden/go/testing/storage"
	m "github.com/notsuhas/envden/go/testing/storage/memory"
	"testing"
)

func TestContract(t *testing.T) {
	s.StorageContract(t, func(t *testing.T) s.Fixture {
		db := m.CreateMemoryStorageAdapter()
		return s.Fixture{Storage: db, Reopen: func() a.Storage { return db }}
	})
}
