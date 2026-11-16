package files

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func LocalOnlyCommand() *cobra.Command {
	c := command.New("local-only", "Keep a managed file local to this checkout")
	command.AddArgument(c, command.Argument{Term: "<file>", Description: "Managed env file in this checkout"})
	command.Action(c, localOnlyAction)

	return c
}
