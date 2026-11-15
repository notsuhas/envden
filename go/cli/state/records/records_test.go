package records

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/state/files"
)

func TestRecover(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, "entry")
	marker := filepath.Join(home, "hold")
	if e := files.AtomicWrite(path, []byte("{invalid"), func() int64 { return 1800000000000 }); e != nil {
		t.Fatal(e)
	}

	decode := func(s string) (any, error) { var v any; e := json.Unmarshal([]byte(s), &v); return v, e }
	var report string
	value, e := RecoverSyncRecord(path, marker, decode, 1800000000000, func(s string) { report = s })
	if e != nil || value != nil {
		t.Fatal(value, e)
	}

	saved, e := os.ReadFile(marker)
	if e != nil || !strings.Contains(string(saved), ".corrupt-1800000000000_") {
		t.Fatal(string(saved), e)
	}

	raw, e := os.ReadFile(string(saved)) //nolint:gosec // The saved path comes from this test temp directory.
	if e != nil || string(raw) != "{invalid" || !strings.Contains(report, "envden resolve --list") {
		t.Fatal(string(raw), e, report)
	}
}
