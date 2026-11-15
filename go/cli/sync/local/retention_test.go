package local

import (
	"os"
	"path/filepath"
	"testing"

	sf "github.com/notsuhas/envden/go/cli/state/files"
)

func TestRecursiveRetention(t *testing.T) {
	home := t.TempDir()
	now := int64(1800000000000)
	clock := func() int64 { return now }
	old := "1700000000000_12345678-1234-1234-1234-123456789abc"
	removed := []string{"state/nested/." + old + ".tmp", "base/nested/file.corrupt-" + old, "conflicts/backups/" + old}
	kept := []string{"state/write.lock/." + old + ".tmp", "conflicts/backups/nested/" + old, "state/not-a-temp", "state/.1800000000000_12345678-1234-1234-1234-123456789abc.tmp"}
	for _, rel := range append(append([]string{}, removed...), kept...) {
		if err := sf.AtomicWrite(filepath.Join(home, rel), []byte("fixture"), clock); err != nil {
			t.Fatal(err)
		}
	}
	if err := PruneBackups(home, now); err != nil {
		t.Fatal(err)
	}
	for _, rel := range removed {
		if _, err := os.Stat(filepath.Join(home, rel)); !os.IsNotExist(err) {
			t.Fatal(rel, err)
		}
	}
	for _, rel := range kept {
		if _, err := os.Stat(filepath.Join(home, rel)); err != nil {
			t.Fatal(rel, err)
		}
	}
}
