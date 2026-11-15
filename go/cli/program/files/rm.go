package files

import (
	"github.com/notsuhas/envden/go/lib/commander"
)

func RmCommand() *commander.Command {
	c := commander.New("rm").Description("Remove an env file everywhere on the next push")
	c.AddOption(commander.NewOption("--yes", "Confirm deletion, including local edits and conflicts"))
	c.AddOption(commander.NewOption("--json", "Print the result as JSON"))
	c.AddArgument(commander.NewArgument("<path>", "Env file path"))
	c.Action(rmAction)

	return c
}
