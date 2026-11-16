package onboarding

import (
	"context"
	"io"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
)

func TestJoinRequiresStateLock(t *testing.T) {
	home := t.TempDir()
	timing := lock.Timing{Now: func() int64 { return 1800000000000 }}
	a := contracts.Adapters{Home: home, Timing: timing}
	err := lock.WithStateLock(context.Background(), home, timing, func(context.Context) error {
		err := JoinVault(context.Background(), a, "http://localhost", JoinOptions{}, Prompts{}, io.Discard, JoinEffects{})
		if !errors.Is(err, errors.Conflict) || err.Error() != "State is locked; retry after the other command finishes" {
			t.Fatal(err)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
