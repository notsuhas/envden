package files

import (
	"github.com/notsuhas/envden/go/lib/commander"
)

func AliasCommand() *commander.Command {
	c := commander.New("alias").Description("Share another repo's env files, for example from a fork")
	c.AddArgument(commander.NewArgument("<repo>", "Repo ID to alias"))
	c.AddArgument(commander.NewArgument("<target>", "Repo ID whose env files it uses"))
	c.Action(aliasAction)

	return c
}
