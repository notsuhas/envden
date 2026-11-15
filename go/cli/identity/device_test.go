package identity

import (
	"bytes"
	"context"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/testing/keychain"
	"testing"
)

func TestDeviceIdentity(t *testing.T) {
	home := t.TempDir()
	memory := keychain.CreateMemoryKeychainAdapter([]string{"get", "set"})
	timing := lock.Timing{Now: func() int64 { return 1800000000000 }}
	ctx := context.Background()
	first, err := DeviceIdentity(ctx, memory, home, "laptop", false, timing)
	if err != nil {
		t.Fatal(err)
	}
	again, err := DeviceIdentity(ctx, memory, home, "ignored rename", false, timing)
	if err != nil || again.Record.Name != "laptop" || !bytes.Equal(first.Record.Id, again.Record.Id) {
		t.Fatal(again, err)
	}
	if bytes.Equal(first.Keys.EncSk, first.Keys.ObjSk) || bytes.Equal(first.Keys.ReqSk, first.Keys.ObjSk) {
		t.Fatal("keys reused")
	}
	next, err := DeviceIdentity(ctx, memory, home, "new", true, timing)
	if err != nil || bytes.Equal(next.Record.Id, first.Record.Id) || next.Record.Name != "new" {
		t.Fatal(next, err)
	}
	s := model.EmptyState("joined")
	s.VaultID = "configured"
	if err = store.SaveState(ctx, home, s, timing); err != nil {
		t.Fatal(err)
	}
	if _, err = DeviceIdentity(ctx, keychain.CreateMemoryKeychainAdapter([]string{"get", "set"}), home, "replacement", false, timing); !errors.Is(err, errors.Locked) {
		t.Fatal(err)
	}
}
func TestStoredIdentity(t *testing.T) {
	if _, e := ReadIdentity(make([]byte, 95)); !errors.Is(e, errors.InvalidData) {
		t.Fatal(e)
	}
}
