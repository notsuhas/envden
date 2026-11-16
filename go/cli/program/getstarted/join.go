package getstarted

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func JoinCommand() *cobra.Command {
	c := command.New("join", "Join using a pairing code or recovery kit in your own terminal")
	command.AddFlag(c, command.Flag{Syntax: "--recovery", Description: "Paste a recovery secret key and vault ID"})
	command.AddFlag(c, command.Flag{Syntax: "--recovery-kit <path>", Description: "Recovery kit path"})
	command.AddFlag(c, command.Flag{Syntax: "--name <name>", Description: "Device name"})
	command.AddFlag(c, command.Flag{Syntax: "--yes", Description: "Use default preferences"})
	command.AddFlag(c, command.Flag{Syntax: "--telemetry <choice>", Description: "Anonymous telemetry", Choices: []string{"on", "off"}})
	command.AddFlag(c, command.Flag{Syntax: "--update-check <choice>", Description: "Daily update check", Choices: []string{"on", "off"}})
	command.AddFlag(c, command.Flag{Syntax: "--shell <shell>", Description: "Shell notice", Choices: []string{"zsh", "bash", "fish", "powershell", "none"}})
	command.AddFlag(c, command.Flag{Syntax: "--agent <choice>", Description: "Install the agent skill", Choices: []string{"on", "off"}})
	command.AddFlag(c, command.Flag{Syntax: "--resume", Description: "Finish a join that was approved while this command wasn't running"})
	command.AddArgument(c, command.Argument{Term: "<server>", Description: "Server address, e.g. envden.your-tailnet.ts.net"})
	command.Action(c, joinAction)

	return c
}
