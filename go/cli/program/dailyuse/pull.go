package dailyuse

import "github.com/notsuhas/envden/go/lib/commander"

func PullCommand() *commander.Command {
	c := commander.New("pull").Description("Fetch and merge changes from your other devices")
	c.AddOption(commander.NewOption("--json", "Print the result as JSON"))
	c.AddOption(commander.NewOption("--all", "Sync all repos"))
	c.AddOption(commander.NewOption("--yes", "Confirm clean changes"))
	c.Action(syncAction("pull"))
	return c
}
