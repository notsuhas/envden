package maintenance

import "github.com/notsuhas/envden/go/cli/program/runtime"
import "github.com/notsuhas/envden/go/cli/version"
import "github.com/notsuhas/envden/go/lib/commander"

func VersionCommand() *commander.Command {
	c := commander.New("version").Description("Print the version")
	c.Action(func(i *commander.Invocation) error { return runtime.Print(i, version.Version) })
	return c
}
