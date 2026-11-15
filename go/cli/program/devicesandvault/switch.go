package devicesandvault

import (
	"github.com/notsuhas/envden/go/cli/admin/move"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/lib/commander"
)

func serverSwitchAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}

	a := env.Adapters
	if err = move.SwitchServer(env.Context, a, i.Args[0], a.Now, a.Fetcher); err != nil {
		return err
	}

	return runtime.Print(i, "Server switched")
}
