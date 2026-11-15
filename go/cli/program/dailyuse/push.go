package dailyuse

import (
	"github.com/notsuhas/envden/go/lib/commander"
)

func PushCommand() *commander.Command {
	c := commander.New("push").Description("Send your changes to the server")
	c.AddOption(commander.NewOption("--json", "Print the result as JSON"))
	c.AddOption(commander.NewOption("--all", "Sync all repos"))
	c.AddOption(commander.NewOption("--yes", "Confirm clean changes"))
	c.Action(syncAction("push"))

	return c
}
