package operation

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	statefiles "github.com/notsuhas/envden/go/cli/state/files"
)

func TestOperationValidation(t *testing.T) {
	valid := `{"targets":[{"root":"r","path":".env","store":"s","mode":"copy"}],"before":[null,"a"],"written":[false,true],"entry":null,"header":"` + strings.Repeat("A", 43) + `","next":null,"server":""}`

	if _, err := DecodeOperation(valid); err != nil {
		t.Fatal(err)
	}

	for _, invalid := range []string{
		strings.Replace(valid, `"root":"r"`, `"root":null`, 1),
		strings.Replace(valid, `"mode":"copy"`, `"mode":"bad"`, 1),
		strings.Replace(valid, `"written":[false,true]`, `"written":[false,null]`, 1),
		strings.Replace(valid, `"before":[null,"a"]`, `"before":[null]`, 1),
		strings.Replace(valid, `"next":null,`, "", 1),
		strings.Replace(valid, `"entry":null`, `"entry":"invalid"`, 1),
	} {
		if _, err := DecodeOperation(invalid); err == nil {
			t.Fatal("accepted malformed record")
		}
	}
}

func TestCorruptOperationIsPreserved(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, "pending.pending")
	now := func() int64 { return 1700000000000 }
	if err := statefiles.AtomicWrite(path, []byte("broken record"), now); err != nil {
		t.Fatal(err)
	}

	reports := []string{}
	value, err := ReadOperation(path, now, func(v string) { reports = append(reports, v) })
	if err != nil || value != nil || len(reports) != 1 {
		t.Fatal(value, err, reports)
	}

	if _, err = os.Stat(path); !os.IsNotExist(err) {
		t.Fatal(err)
	}

	marker, err := os.ReadFile(filepath.Join(home, "pending.corrupt"))
	if err != nil {
		t.Fatal(err)
	}

	preserved, err := os.ReadFile(string(marker)) //nolint:gosec // G703: the marker is produced by this test inside its private temporary directory.
	if err != nil || string(preserved) != "broken record" {
		t.Fatal(err)
	}
}
