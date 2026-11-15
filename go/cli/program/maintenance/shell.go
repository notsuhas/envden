package maintenance

import "github.com/notsuhas/envden/go/cli/program/runtime"
import "github.com/notsuhas/envden/go/cli/agent"
import "github.com/notsuhas/envden/go/cli/output/prompts"
import "github.com/notsuhas/envden/go/lib/commander"

func ShellCommand() *commander.Command {
	c := commander.New("shell").Description("Manage the shell notice")
	c0 := commander.New("install").Description("Add the out-of-sync notice to your shell config")
	c0.AddArgument(commander.NewArgument("[shell]", "Shell; asks if omitted").Choices("zsh", "bash", "fish", "powershell"))
	c0.Action(func(i *commander.Invocation) error {
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
		return agent.ManageShell(env.Adapters, i.Command.CommandName, shell)
	})
	c.AddCommand(c0)
	c1 := commander.New("uninstall").Description("Remove the out-of-sync notice from your shell config")
	c1.AddArgument(commander.NewArgument("[shell]", "Shell; asks if omitted").Choices("zsh", "bash", "fish", "powershell"))
	c1.Action(func(i *commander.Invocation) error {
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
		return agent.ManageShell(env.Adapters, i.Command.CommandName, shell)
	})
	c.AddCommand(c1)
	return c
}
