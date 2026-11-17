package sync

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func TestUnconfiguredSyncRefusesPatternsFirst(t *testing.T) {
	for _, pushing := range []bool{false, true} {
		for _, row := range []struct {
			config string
			code   envdenerrors.Code
		}{
			{`{"env-files":{"include":["[a]"]}}`, envdenerrors.InvalidInput},
			{`{"env-files":{"exclude":["[a]"]}}`, envdenerrors.InvalidInput},
			{`{"env-files":{"include":[".env*"]}}`, envdenerrors.NotFound},
			{`{"env-files":{"include":["[a]"]},"unknown":true}`, envdenerrors.NotFound},
		} {
			home := t.TempDir()
			if err := os.WriteFile(filepath.Join(home, "config.json"), []byte(row.config), 0600); err != nil {
				t.Fatal(err)
			}
			now := func() int64 { return 1800000000000 }
			a := contracts.Adapters{Home: home, Timing: lock.Timing{Now: now}}
			_, err := runSync(context.Background(), a, Options{Yes: true, Now: now}, pushing, nil)
			if !envdenerrors.Is(err, row.code) {
				t.Errorf("push=%v config=%s: got %v, want %s", pushing, row.config, err, row.code)
			}
		}
	}
}
