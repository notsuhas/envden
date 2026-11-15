package dailyuse

import "github.com/notsuhas/envden/go/lib/commander"

func DiffCommand() *commander.Command {
	c := commander.New("diff").Description("Show changed key names without values")
	c.AddOption(commander.NewOption("--json", "Print the result as JSON"))
	c.AddOption(commander.NewOption("--all", "Include all repos"))
	c.Action(diffAction)
	return c
}
