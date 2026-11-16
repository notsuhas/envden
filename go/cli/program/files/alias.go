package files

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func AliasCommand() *cobra.Command {
	c := command.New("alias", "Share another repo's env files, for example from a fork")
	command.AddArgument(c, command.Argument{Term: "<repo>", Description: "Repo ID to alias"})
	command.AddArgument(c, command.Argument{Term: "<target>", Description: "Repo ID whose env files it uses"})
	command.Action(c, aliasAction)

	return c
}
