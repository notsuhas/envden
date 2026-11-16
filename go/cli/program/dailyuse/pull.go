package dailyuse

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func PullCommand() *cobra.Command {
	c := command.New("pull", "Fetch and merge changes from your other devices")
	command.AddFlag(c, command.Flag{Syntax: "--json", Description: "Print the result as JSON"})
	command.AddFlag(c, command.Flag{Syntax: "--all", Description: "Sync all repos"})
	command.AddFlag(c, command.Flag{Syntax: "--yes", Description: "Confirm clean changes"})
	command.Action(c, syncAction("pull"))

	return c
}
