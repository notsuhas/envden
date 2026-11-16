package dailyuse

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func DiffCommand() *cobra.Command {
	c := command.New("diff", "Show changed key names without values")
	command.AddFlag(c, command.Flag{Syntax: "--json", Description: "Print the result as JSON"})
	command.AddFlag(c, command.Flag{Syntax: "--all", Description: "Include all repos"})
	command.Action(c, diffAction)

	return c
}
