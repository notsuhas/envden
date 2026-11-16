package pairing

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	fake "github.com/notsuhas/envden/go/testing/keychain"
)

func TestExchangeCleanupRequiresStateLock(t *testing.T) {
	home := t.TempDir()
	timing := lock.Timing{Now: func() int64 { return 1800000000000 }}
	a := contracts.Adapters{Home: home, Timing: timing, Keychain: fake.CreateFakeKeychainAdapter(fake.Operations{Get: func(string, bool) ([]byte, error) { return nil, errors.New(errors.NotFound, "fixture") }})}
	err := lock.WithStateLock(context.Background(), home, timing, func(context.Context) error {
		if err := os.WriteFile(filepath.Join(home, "state", "pair-joiner"), []byte("saved"), 0600); err != nil {
			t.Fatal(err)
		}
		err := ExchangeJoiner(context.Background(), a, nil, identity.Identity{}, nil, "", nil)
		if !errors.Is(err, errors.Conflict) || err.Error() != "State is locked; retry after the other command finishes" {
			t.Fatal(err)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
