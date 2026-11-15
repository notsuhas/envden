package dailyuse

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func StatusCommand() *commander.Command {
	c := commander.New("status").Description("Show what changed here, what's newer on the server and what needs attention")
	c.AddOption(commander.NewOption("--json", "Machine-readable status"))
	c.AddOption(commander.NewOption("--refresh-cache", "").HideHelp())
	c.Action(stub.Action)
	return c
}
