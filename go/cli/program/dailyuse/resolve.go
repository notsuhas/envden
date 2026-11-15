package dailyuse

import "github.com/notsuhas/envden/go/lib/commander"

func ResolveCommand() *commander.Command {
	c := commander.New("resolve").Description("Keep yours, take the server's, or finish an edited conflict")
	c.AddOption(commander.NewOption("--json", "Print the result as JSON"))
	c.AddOption(commander.NewOption("--list", "List unresolved conflicts"))
	c.AddOption(commander.NewOption("--repo <path>", "Select a checkout"))
	c.AddOption(commander.NewOption("--keep-mine", "Keep your version").Conflicts("takeServer"))
	c.AddOption(commander.NewOption("--take-server", "Take the server's version"))
	c.AddArgument(commander.NewArgument("[file]", "Conflicted env file"))
	c.Action(resolveAction)
	return c
}
