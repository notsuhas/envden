package self

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	fake "github.com/notsuhas/envden/go/testing/shell"
)

func TestRefreshFailureDoesNotStopOtherShells(t *testing.T) {
	home := t.TempDir()
	calls := 0
	var output bytes.Buffer
	a := contracts.Adapters{Home: home, UserHome: home, Executable: "/binary", Now: func() int64 { return 0 }, Shell: func(name string) adapters.Shell {
		return fake.CreateFakeShellAdapter(fake.Operations{Installed: func() (bool, error) { return true, nil }, Install: func(string) error { calls++; return fmt.Errorf("failed") }})
	}}
	RefreshInstallation(a, &output)
	if calls != 4 || strings.Count(output.String(), "optional installation refresh failed") != 4 {
		t.Fatal(calls, output.String())
	}
}

func TestUpdateLockRefusesSecondUpdater(t *testing.T) {
	home := t.TempDir()
	timing := lock.Timing{Now: func() int64 { return 1800000000000 }, Delays: []int64{}}
	a := contracts.Adapters{Home: home, Timing: timing}
	path := filepath.Join(home, "state", "update")
	e := lock.WithStateLock(context.Background(), path, timing, func(context.Context) error {
		_, err := SelfUpdate(context.Background(), a, Options{})
		if !errors.Is(err, errors.Conflict) || err.Error() != "Another envden update is running" {
			t.Fatal(err)
		}

		return nil
	})
	if e != nil {
		t.Fatal(e)
	}
}
