package store_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
)

func TestTypeScriptStateBytes(t *testing.T) {
	raw, e := os.ReadFile("testdata/ts-state.json")
	if e != nil {
		t.Fatal(e)
	}

	var golden struct{ Empty, Rich, Config string }
	if e = json.Unmarshal(raw, &golden); e != nil {
		t.Fatal(e)
	}

	home := t.TempDir()
	ctx := context.Background()
	timing := lock.Timing{Now: func() int64 { return 1800000000000 }}
	s := model.EmptyState("test")
	compare := func(want string) {
		t.Helper()
		if e := store.SaveState(ctx, home, s, timing); e != nil {
			t.Fatal(e)
		}

		got, e := os.ReadFile(filepath.Join(home, "state", "device.json"))
		if e != nil || string(got) != want {
			t.Fatalf("got %s\nwant %s\n%v", got, want, e)
		}
	}
	compare(golden.Empty)
	s.VaultID = "vault"
	s.Session = &model.Window{FreshUntil: 123}
	s.Headers = []string{"first-header"}
	s.VerifiedState = json.RawMessage(`{"devices":{"$map":[["d",{"id":{"$bytes":"AQ"}}]]},"seq":{"$bigint":"123"},"repairIds":{"$set":["a"]}}`)
	s.Touch("vaultId", "session", "verifiedState")
	compare(golden.Rich)
	loaded, e := store.LoadState(home)
	if e != nil {
		t.Fatal(e)
	}

	s = loaded
	compare(golden.Rich)
	if _, e = settings.SetConfig(ctx, "telemetry", "on", home, timing, false); e != nil {
		t.Fatal(e)
	}

	if _, e = settings.SetConfig(ctx, "placement", `{"z":"link","a":"copy"}`, home, timing, false); e != nil {
		t.Fatal(e)
	}

	got, e := os.ReadFile(filepath.Join(home, "config.json"))
	if e != nil || string(got) != golden.Config {
		t.Fatalf("config got %s\nwant %s: %v", got, golden.Config, e)
	}
}
