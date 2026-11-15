package files

import "github.com/notsuhas/envden/go/lib/commander"

func UntrackCommand() *commander.Command {
	c := commander.New("untrack").Description("Stop tracking a checkout and restore regular env files")
	c.AddArgument(commander.NewArgument("<path>", "Checkout root"))
	c.Action(untrackAction)
	return c
}
