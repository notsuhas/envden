package dailyuse

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func PushCommand() *cobra.Command {
	c := command.New("push", "Send your changes to the server")
	command.AddFlag(c, command.Flag{Syntax: "--json", Description: "Print the result as JSON"})
	command.AddFlag(c, command.Flag{Syntax: "--all", Description: "Sync all repos"})
	command.AddFlag(c, command.Flag{Syntax: "--yes", Description: "Confirm clean changes"})
	command.Action(c, syncAction("push"))

	return c
}
