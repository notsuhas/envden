package files

import (
	"bytes"
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"testing"
)

func TestTrackActionPassesChoicesUnderReentrantLock(t *testing.T) {
	ctx := context.Background()
	now := func() int64 { return 100 }
	a := contracts.Adapters{Home: t.TempDir(), Now: now, Timing: lock.Timing{Now: now}}
	state := model.EmptyState("test")
	state.Server = &model.Server{}
	state.VaultID = "vault"
	if err := store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
		t.Fatal(err)
	}
	called := false
	command := TrackCommand(func(ctx context.Context, a contracts.Adapters, state *model.State, o TrackOptions) error {
		called = true
		if !o.Copy || !o.Verbose || len(o.ScanRoot) != 1 || o.ScanRoot[0] != "/repo" || o.Command != "track" || o.Now() != 100 {
			t.Fatal(o)
		}
		return store.SaveState(ctx, a.Home, state, a.Timing)
	})
	runtime.Bind(command, runtime.Environment{Context: ctx, Adapters: a})
	defer runtime.Release(command)
	if _, err := command.Parse([]string{"/repo", "--copy", "--verbose"}); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("scanner not called")
	}
}

func TestPromptWriterPreservesControlBytes(t *testing.T) {
	var buffer bytes.Buffer
	writer := promptWriter(output.TerminalWriter{Writer: output.TerminalWriter{Writer: &buffer}})
	control := "\x1b[?25l"
	if _, err := writer.Write([]byte(control)); err != nil {
		t.Fatal(err)
	}
	if buffer.String() != control {
		t.Fatal("terminal controls sanitized")
	}
}

func TestScanShellPaths(t *testing.T) {
	for _, row := range []struct{ path, want string }{{"/home", "~"}, {"/home/repo", "~/repo"}, {"/home/has space", "~/'has space'"}, {"/elsewhere", "/elsewhere"}, {"/home/a'b", "~/'a'\\''b'"}} {
		if got := scanShellPath(row.path, "/home"); got != row.want {
			t.Fatalf("%q got %q want %q", row.path, got, row.want)
		}
	}
}
