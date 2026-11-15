package devicesandvault

import (
	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/lib/commander"
)

func deviceRenameAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}

	kind, err := devices.RenameDevice(env.Context, env.Adapters, i.Args[0], env.Adapters.Now, env.Adapters.Fetcher)
	if err != nil {
		return err
	}

	text := "This device already has that name"
	if kind != "unchanged" {
		text = "This device is now " + output.SanitizeTerminal(i.Args[0])
	}

	return runtime.Print(i, text)
}
