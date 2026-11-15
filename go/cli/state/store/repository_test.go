package store

import (
	"context"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func fixtureTiming() lock.Timing {
	return lock.Timing{Now: func() int64 { return 1800000000000 }, Wait: func(int64) error { return nil }}
}
func TestRepository(t *testing.T) {
	home := t.TempDir()
	s, err := LoadState(home)
	if err != nil || s != nil {
		t.Fatal(s, err)
	}
	s = model.EmptyState("test")
	if err = SaveState(context.Background(), home, s, fixtureTiming()); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, "state", "device.json")
	raw, _ := os.ReadFile(path)
	expected := `{"format":1,"deviceName":"test","entries":[],"approved":[],"links":[],"aliases":{},"telemetry":false,"updateCheck":true,"headerRefs":[]}`
	if string(raw) != expected {
		t.Fatalf("state bytes\ngot  %s\nwant %s", raw, expected)
	}
	s.Telemetry = true
	s.Headers = []string{"first-header"}
	if err = SaveState(context.Background(), home, s, fixtureTiming()); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadState(home)
	if err != nil || !loaded.Telemetry || !reflect.DeepEqual(s.Headers, loaded.Headers) {
		t.Fatal(loaded, err)
	}
	for _, p := range []string{home, filepath.Dir(path), path} {
		info, _ := os.Stat(p)
		want := os.FileMode(0700)
		if p == path {
			want = 0600
		}
		if info.Mode().Perm() != want {
			t.Fatal(p, info.Mode())
		}
	}
	refs, err := StoreHeaders(home, s.Headers, fixtureTiming().Now)
	if err != nil {
		t.Fatal(err)
	}
	hp := filepath.Join(home, "state", "headers", refs[0])
	before, _ := os.Stat(hp)
	s.Headers = append(s.Headers, "second-header")
	if err = SaveState(context.Background(), home, s, fixtureTiming()); err != nil {
		t.Fatal(err)
	}
	after, _ := os.Stat(hp)
	if !before.ModTime().Equal(after.ModTime()) {
		t.Fatal("immutable header rewritten")
	}
}

func TestInvalidState(t *testing.T) {
	for _, raw := range []string{`{}`, `{"format":1}`, `{"format":1,"deviceName":"test","entries":[],"approved":[],"links":[],"aliases":{},"telemetry":false,"updateCheck":true,"headerRefs":[],"unknown":true}`} {
		home := t.TempDir()
		if err := files.AtomicWrite(filepath.Join(home, "state", "device.json"), []byte(raw), fixtureTiming().Now); err != nil {
			t.Fatal(err)
		}
		if _, err := LoadState(home); !errors.Is(err, errors.InvalidData) {
			t.Fatal(err)
		}
	}
}

func TestHeaderValidation(t *testing.T) {
	home := t.TempDir()
	for _, hash := range []string{"../escape", strings.Repeat("0", 64)} {
		if _, err := RestoreHeaders(home, []string{hash}); !errors.Is(err, errors.InvalidData) {
			t.Fatal(err)
		}
	}
}
