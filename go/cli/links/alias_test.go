package links

import (
	"context"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
)

func TestInheritedNamesAreOrdinaryAliases(t *testing.T) {
	ctx := context.Background()
	home := t.TempDir()
	timing := lock.Timing{Now: func() int64 { return 0 }}
	if err := store.SaveState(ctx, home, model.EmptyState("test"), timing); err != nil {
		t.Fatal(err)
	}

	a := contracts.Adapters{Home: home, Timing: timing}
	for _, pair := range [][2]string{{"__proto__", "x"}, {"y", "toString"}} {
		if err := AliasRepo(ctx, a, pair[0], pair[1]); err != nil {
			t.Fatal(err)
		}
	}

	s, err := store.LoadState(home)
	if err != nil || s.Aliases.Get("__proto__") != "x" || s.Aliases.Get("y") != "toString" || s.Aliases.Get("constructor") != nil {
		t.Fatal(s, err)
	}
}
