package enginetest

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/notsuhas/envden/go/cli/sync/local"
)

func TestExpiredStateFilesKeepLiveRecords(t *testing.T) {
	home := t.TempDir()
	f := &fixture{t: t}
	old := clock() - 31*86400000
	id := "12345678-abcd-4000-8000-000000000000"
	stamp := fmt.Sprintf("%d_%s", old, id)
	expired := []string{"state/attempts/receipt.corrupt-" + stamp, "state/record.corrupt-" + stamp, "state/attempts/record.corrupt-" + stamp, "state/." + stamp + ".tmp", "state/headers/nested/." + stamp + ".tmp", "state/update/state/." + stamp + ".tmp", "base/nested/." + stamp + ".tmp", "state/blobs/." + stamp + ".tmp", "state/file-lists/." + stamp + ".tmp", "base/file.pending.corrupt-" + stamp}
	recent := []string{"state/live.json", fmt.Sprintf("state/attempts/recent.corrupt-%d_%s", clock(), id), "base/file.pending"}

	for _, path := range append(append([]string{}, expired...), recent...) {
		dest := path

		if path == "state/record.corrupt-"+stamp {
			dest = filepath.Join(path, "secret")
		}

		f.write(filepath.Join(home, dest), "secret")
	}

	for _, path := range expired {
		must(t, os.Chtimes(filepath.Join(home, path), time.UnixMilli(clock()), time.UnixMilli(clock())))
	}

	for _, path := range recent {
		must(t, os.Chtimes(filepath.Join(home, path), time.UnixMilli(0), time.UnixMilli(0)))
	}

	must(t, local.PruneBackups(home, clock()))

	for _, path := range expired {
		_, err := os.Lstat(filepath.Join(home, path))

		if !os.IsNotExist(err) {
			t.Fatal(path, err)
		}
	}

	for _, path := range recent {
		equal(t, readValue(filepath.Join(home, path)).present, true)
	}
}

func TestRetentionSkipsNestedLocks(t *testing.T) {
	home := t.TempDir()
	f := &fixture{t: t}
	paths := []string{"state/update/state/write.lock/.1700000000000_12345678-abcd-4000-8000-000000000000.tmp", "base/write.lock/.1700000000000_12345678-abcd-4000-8000-000000000000.tmp"}

	for _, path := range paths {
		f.write(filepath.Join(home, path), "owner")
	}

	must(t, local.PruneBackups(home, clock()))

	for _, path := range paths {
		equal(t, readValue(filepath.Join(home, path)).present, true)
	}
}

func TestUUIDPrefixIsNotRetentionTimestamp(t *testing.T) {
	home := t.TempDir()
	f := &fixture{t: t}
	path := filepath.Join(home, "base/file.corrupt-12345678-abcd-4000-8000-000000000000")
	f.write(path, "saved")
	must(t, local.PruneBackups(home, clock()))
	equal(t, readValue(path).present, true)
}
