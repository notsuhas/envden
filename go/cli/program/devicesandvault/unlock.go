package devicesandvault

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func UnlockCommand() *cobra.Command {
	c := command.New("unlock", "Log in with your master password to restart the unlock period")
	command.Action(c, unlockAction)

	return c
}
