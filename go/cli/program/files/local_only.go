package files

import (
	"github.com/notsuhas/envden/go/lib/commander"
)

func LocalOnlyCommand() *commander.Command {
	c := commander.New("local-only").Description("Keep a managed file local to this checkout")
	c.AddArgument(commander.NewArgument("<file>", "Managed env file in this checkout"))
	c.Action(localOnlyAction)

	return c
}
