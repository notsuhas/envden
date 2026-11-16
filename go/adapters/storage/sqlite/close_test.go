package sqlite

import (
	"os"
	"slices"
	"testing"
)

func TestCloseLeavesOnlyTheDatabaseFile(t *testing.T) {
	dir := t.TempDir()
	storage, err := CreateSqliteStorageAdapter(dir, 0)
	if err != nil {
		t.Fatal(err)
	}

	check(t, storage.PutBlob(b(1), b(2), b(3), nil, 0, 0))
	if err := storage.Close(); err != nil {
		t.Fatal(err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	names := []string{}
	for _, entry := range entries {
		names = append(names, entry.Name())
	}

	if slices.ContainsFunc(names, func(name string) bool { return name == "envden.sqlite-wal" || name == "envden.sqlite-shm" }) || !slices.Contains(names, "envden.sqlite") {
		t.Fatal(names)
	}
}
