package files

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
	"os"
)

func TrackCommand(scanners ...TrackScanner) *cobra.Command {
	cwd, _ := os.Getwd()
	c := command.New("track", "Scan, approve and link checkout env files")
	command.AddFlag(c, command.Flag{Syntax: "--copy", Description: "Place real copies instead of links"})
	command.AddFlag(c, command.Flag{Syntax: "--verbose", Description: "List each repo and env file the scan skipped"})
	command.AddArgument(c, command.Argument{Term: "[path]", Description: "Checkout or scan root", Default: cwd, DefaultDescription: "current directory"})
	command.Action(c, func(i *command.Invocation) error { return trackAction(i, scanners) })

	return c
}
