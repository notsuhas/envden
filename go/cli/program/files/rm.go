package files

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func RmCommand() *cobra.Command {
	c := command.New("rm", "Remove an env file everywhere on the next push")
	command.AddFlag(c, command.Flag{Syntax: "--yes", Description: "Confirm deletion, including local edits and conflicts"})
	command.AddFlag(c, command.Flag{Syntax: "--json", Description: "Print the result as JSON"})
	command.AddArgument(c, command.Argument{Term: "<path>", Description: "Env file path"})
	command.Action(c, rmAction)

	return c
}
