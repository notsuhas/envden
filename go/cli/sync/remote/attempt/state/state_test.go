package state

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	model "github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
)

func TestAttemptNamesAndCorruption(t *testing.T) {
	home := t.TempDir()
	clock := func() int64 { return 1700000000000 }
	a := contracts.Adapters{Home: home, Now: clock}
	directory := filepath.Join(home, "state", "attempts")
	raw, err := jsonvalue.Marshal(Attempt{Header: strings.Repeat("A", 43), Sequence: "2", Places: []string{}, Entries: []string{}})
	if err != nil {
		t.Fatal(err)
	}

	name := Receipt(string(raw))

	if _, err = DecodeAttempt(string(raw), name); err != nil {
		t.Fatal(err)
	}

	if _, err = DecodeAttempt(string(raw)+" ", name); err == nil {
		t.Fatal("checksum ignored")
	}
	if err = statefiles.AtomicWrite(filepath.Join(directory, name), raw, clock); err != nil {
		t.Fatal(err)
	}
	if err = statefiles.AtomicWrite(filepath.Join(directory, "unrelated"), []byte("bad"), clock); err != nil {
		t.Fatal(err)
	}

	attempts, err := ReadAttempts(a, nil, clock, nil)
	if err != nil || len(attempts) != 1 {
		t.Fatal(attempts, err)
	}

	if invalid, err := InvalidAttemptState(home); err != nil || invalid {
		t.Fatal(invalid, err)
	}
	if err = statefiles.AtomicWrite(filepath.Join(directory, name), []byte("bad"), clock); err != nil {
		t.Fatal(err)
	}

	if invalid, err := InvalidAttemptState(home); err != nil || !invalid {
		t.Fatal(invalid, err)
	}

	link := model.Link{Store: filepath.Join(home, "store", ".env")}
	attempts, err = ReadAttempts(a, []model.Link{link}, clock, nil)
	if err != nil || len(attempts) != 0 {
		t.Fatal(attempts, err)
	}

	marker, err := localfiles.ReadBytes(localfiles.BasePath(home, link.Store) + ".corrupt")
	if err != nil || string(marker) != filepath.Join(directory, name) {
		t.Fatal(string(marker), err)
	}

	if _, err = os.Stat(filepath.Join(directory, name+".invalid")); !os.IsNotExist(err) {
		t.Fatal(err)
	}

	backups, err := filepath.Glob(filepath.Join(directory, name+".corrupt-*"))
	if err != nil || len(backups) != 1 {
		t.Fatal(backups, err)
	}
}
