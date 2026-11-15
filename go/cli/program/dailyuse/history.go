package dailyuse

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func HistoryCommand() *commander.Command {
	c := commander.New("history").Description("List the versions the server keeps, or restore one as a local edit")
	c.AddOption(commander.NewOption("--all", "Include every tracked file").Conflicts("restore"))
	c.AddOption(commander.NewOption("--restore <version>", "Write that version into the checkout without pushing"))
	c.AddOption(commander.NewOption("--yes", "Confirm the restore"))
	c.AddOption(commander.NewOption("--json", "Print the result as JSON"))
	c.AddArgument(commander.NewArgument("[file]", "Env file path"))
	c.Action(stub.Action)
	return c
}
