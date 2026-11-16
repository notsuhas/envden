package files

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func UntrackCommand() *cobra.Command {
	c := command.New("untrack", "Stop tracking a checkout and restore regular env files")
	command.AddArgument(c, command.Argument{Term: "<path>", Description: "Checkout root"})
	command.Action(c, untrackAction)

	return c
}
