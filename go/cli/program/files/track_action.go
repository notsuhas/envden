package files

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/lib/clack"
	"io"
	"os"

	"github.com/notsuhas/envden/go/lib/commander"
)

type TrackOptions struct {
	ScanRoot      []string
	Copy, Verbose bool
	Command       string
	Now           func() int64
}
type TrackScanner func(context.Context, contracts.Adapters, *model.State, TrackOptions) error

func trackAction(i *commander.Invocation, scanners []TrackScanner) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}
	return lock.WithStateLock(env.Context, env.Adapters.Home, env.Adapters.Timing, func(ctx context.Context) error {
		local, err := store.LoadState(env.Adapters.Home)
		if err != nil {
			return err
		}
		local, err = state.RequireConfigured(local)
		if err != nil {
			return err
		}
		scanner := WorkspaceScanner(env.Interactive, clack.New(os.Stdin, promptWriter(runtime.Writer(i.Command, false))), runtime.Writer(i.Command, false), runtime.Writer(i.Command, true))
		if len(scanners) > 0 && scanners[0] != nil {
			scanner = scanners[0]
		}
		copy, _ := i.Values["copy"].(bool)
		verbose, _ := i.Values["verbose"].(bool)
		return scanner(ctx, env.Adapters, local, TrackOptions{ScanRoot: []string{i.Args[0]}, Copy: copy, Verbose: verbose, Command: "track", Now: env.Adapters.Now})
	})
}

func promptWriter(writer io.Writer) io.Writer {
	for {
		switch wrapped := writer.(type) {
		case output.TerminalWriter:
			writer = wrapped.Writer
		case *output.TerminalWriter:
			writer = wrapped.Writer
		default:
			return writer
		}
	}
}
