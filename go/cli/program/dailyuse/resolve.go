package dailyuse

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func ResolveCommand() *cobra.Command {
	c := command.New("resolve", "Keep yours, take the server's, or finish an edited conflict")
	command.AddFlag(c, command.Flag{Syntax: "--json", Description: "Print the result as JSON"})
	command.AddFlag(c, command.Flag{Syntax: "--list", Description: "List unresolved conflicts"})
	command.AddFlag(c, command.Flag{Syntax: "--repo <path>", Description: "Select a checkout"})
	command.AddFlag(c, command.Flag{Syntax: "--keep-mine", Description: "Keep your version", Conflicts: []string{"takeServer"}})
	command.AddFlag(c, command.Flag{Syntax: "--take-server", Description: "Take the server's version"})
	command.AddArgument(c, command.Argument{Term: "[file]", Description: "Conflicted env file"})
	command.Action(c, resolveAction)

	return c
}
