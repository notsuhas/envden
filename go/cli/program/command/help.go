package command

import (
	"strings"

	"github.com/spf13/cobra"
)

func AddHelpCommands(c *cobra.Command) {
	if !c.HasSubCommands() {
		return
	}

	for _, child := range c.Commands() {
		AddHelpCommands(child)
	}

	help := &cobra.Command{
		Use:   "help [command]",
		Short: "display help for command",
		RunE:  func(cmd *cobra.Command, _ []string) error { return cmd.Parent().Help() },
	}
	c.SetHelpCommand(help)
	c.AddCommand(help)
}

func prepareHelp(c *cobra.Command, args []string) ([]string, error) {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return []string{"--help"}, nil
	}

	for _, child := range c.Commands() {
		if child.Name() == args[0] && child.Name() != "help" {
			return []string{child.Name(), "--help"}, nil
		}
	}

	c.InitDefaultHelpFlag()
	c.InitDefaultVersionFlag()

	writer := c.OutOrStdout()
	c.SetOut(c.ErrOrStderr())
	_ = c.Help()
	c.SetOut(writer)

	return nil, &ExitError{ExitCode: 1}
}
