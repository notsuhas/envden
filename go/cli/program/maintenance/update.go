package maintenance

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func UpdateCommand() *commander.Command {
	c := commander.New("update").Description("Update envden through the method it was installed with")
	c.AddOption(commander.NewOption("--check", "Check for a release without installing"))
	c.AddOption(commander.NewOption("--post-install", "Refresh installed integrations"))
	c.Action(stub.Action)
	return c
}
