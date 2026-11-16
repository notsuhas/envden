package links

import (
	"context"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
)

func TestPrototypeAliasTarget(t *testing.T) {
	for _, name := range []string{"constructor", "toString", "__proto__", "hasOwnProperty"} {
		if got := DeriveAlias(jsonvalue.Object{}, "foo", name); got != "chain" {
			t.Fatal(name, got)
		}
	}
}

func TestPrototypeAliasSourceNotSaved(t *testing.T) {
	ctx := context.Background()
	home := t.TempDir()
	timing := lock.Timing{Now: func() int64 { return 0 }}
	if err := store.SaveState(ctx, home, model.EmptyState("test"), timing); err != nil {
		t.Fatal(err)
	}
	if err := AliasRepo(ctx, contracts.Adapters{Home: home, Timing: timing}, "__proto__", "x"); err != nil {
		t.Fatal(err)
	}
	s, err := store.LoadState(home)
	if err != nil || len(s.Aliases) != 0 {
		t.Fatal(s, err)
	}
}
