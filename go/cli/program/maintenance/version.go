package maintenance

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func VersionCommand() *commander.Command {
	c := commander.New("version").Description("Print the version")
	c.Action(stub.Action)
	return c
}
