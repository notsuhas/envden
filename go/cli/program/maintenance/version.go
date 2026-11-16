package maintenance

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/spf13/cobra"
)

func VersionCommand() *cobra.Command {
	c := command.New("version", "Print the version")
	command.Action(c, func(i *command.Invocation) error { return runtime.Print(i, version.Version) })

	return c
}
