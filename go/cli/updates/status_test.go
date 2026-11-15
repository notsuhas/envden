package updates

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/state/files"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func TestUpdateStatus(t *testing.T) {
	home := t.TempDir()
	now := func() int64 { return 100 }
	if got := UpdateStatus(home); got.Available || got.Required {
		t.Fatal(got)
	}

	if err := files.PrivateDirectory(filepath.Join(home, "state")); err != nil {
		t.Fatal(err)
	}

	if err := SaveUpdateCache(home, Cache{Latest: "99.0.0", Message: "notice"}, now); err != nil {
		t.Fatal(err)
	}

	if err := RecordUpdateRequired(home, envdenerrors.New(envdenerrors.ClientTooOld, "update"), now); err != nil {
		t.Fatal(err)
	}

	got := UpdateStatus(home)
	if !got.Available || !got.Required || got.Message != "notice" {
		t.Fatal(got)
	}

	if err := WithUpdateStatus(context.Background(), home, func(ctx context.Context) error { return AuthenticatedRequestSucceeded(ctx) }); err != nil {
		t.Fatal(err)
	}

	if UpdateStatus(home).Required {
		t.Fatal("not cleared")
	}

	if err := RecordUpdateRequired(home, envdenerrors.New(envdenerrors.ClientTooOld, "The server requires a version that doesn't exist"), now); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(home, "state", "update-required")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
}

func TestUpdateCacheOrder(t *testing.T) {
	home := t.TempDir()
	now := func() int64 { return 100 }
	c := Cache{}
	c.Latest = "99.0.0"
	c.touch("latest")
	at := int64(100)
	c.CheckedAt = &at
	c.touch("checkedAt")
	if e := SaveUpdateCache(home, c, now); e != nil {
		t.Fatal(e)
	}

	raw, e := os.ReadFile(filepath.Join(home, "state", "updates.json"))
	if e != nil || string(raw) != `{"latest":"99.0.0","checkedAt":100}` {
		t.Fatal(string(raw), e)
	}

	loaded := ReadUpdateCache(home)
	if e = SaveUpdateCache(home, loaded, now); e != nil {
		t.Fatal(e)
	}

	saved, _ := os.ReadFile(filepath.Join(home, "state", "updates.json"))
	if string(saved) != string(raw) {
		t.Fatal(string(saved))
	}
}
