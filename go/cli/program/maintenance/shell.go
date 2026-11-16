package maintenance

import (
	"github.com/notsuhas/envden/go/cli/agent"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/spf13/cobra"
)

func ShellCommand() *cobra.Command {
	c := command.New("shell", "Manage the shell notice")
	c0 := command.New("install", "Add the out-of-sync notice to your shell config")
	command.AddArgument(c0, command.Argument{Term: "[shell]", Description: "Shell; asks if omitted", Choices: []string{"zsh", "bash", "fish", "powershell"}})
	command.Action(c0, func(i *command.Invocation) error {
		env, e := runtime.Get(i)
		if e != nil {
			return e
		}

		shell := ""
		if len(i.Args) > 0 {
			shell = i.Args[0]
		} else {
			shell, e = prompts.ShellChoice()
			if e != nil {
				return e
			}
		}

		return agent.ManageShell(env.Adapters, i.Command.Name(), shell)
	})
	c.AddCommand(c0)
	c1 := command.New("uninstall", "Remove the out-of-sync notice from your shell config")
	command.AddArgument(c1, command.Argument{Term: "[shell]", Description: "Shell; asks if omitted", Choices: []string{"zsh", "bash", "fish", "powershell"}})
	command.Action(c1, func(i *command.Invocation) error {
		env, e := runtime.Get(i)
		if e != nil {
			return e
		}

		shell := ""
		if len(i.Args) > 0 {
			shell = i.Args[0]
		} else {
			shell, e = prompts.ShellChoice()
			if e != nil {
				return e
			}
		}

		return agent.ManageShell(env.Adapters, i.Command.Name(), shell)
	})
	c.AddCommand(c1)

	return c
}
