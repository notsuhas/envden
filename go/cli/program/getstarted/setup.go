package getstarted

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func SetupCommand() *cobra.Command {
	c := command.New("setup", "Create a vault and configure this device")
	command.AddFlag(c, command.Flag{Syntax: "--yes", Description: "Take defaults; secrets and checkout approval still require your terminal"})
	command.AddFlag(c, command.Flag{Syntax: "--server <url>", Description: "Use this server"})
	command.AddFlag(c, command.Flag{Syntax: "--kit-out <file>", Description: "Write the recovery kit as JSON to a private file instead of a PDF"})
	command.AddFlag(c, command.Flag{Syntax: "--name <name>", Description: "Device name"})
	command.AddFlag(c, command.Flag{Syntax: "--host-server", Description: "Run the envden server on this machine; no setup token needed"})
	command.AddFlag(c, command.Flag{Syntax: "--setup-token <token>", Description: "Setup token, visible to other processes; use the prompt in a terminal"})
	command.AddFlag(c, command.Flag{Syntax: "--telemetry <choice>", Description: "Anonymous telemetry", Choices: []string{"on", "off"}})
	command.AddFlag(c, command.Flag{Syntax: "--update-check <choice>", Description: "Daily update check", Choices: []string{"on", "off"}})
	command.AddFlag(c, command.Flag{Syntax: "--shell <shell>", Description: "Shell notice", Choices: []string{"zsh", "bash", "fish", "powershell", "none"}})
	command.AddFlag(c, command.Flag{Syntax: "--agent <choice>", Description: "Install the agent skill", Choices: []string{"on", "off"}})
	command.AddFlag(c, command.Flag{Syntax: "--scan-root <path...>", Description: "Roots to scan for repos"})
	command.AddFlag(c, command.Flag{Syntax: "--exclude-root <path...>", Description: "Roots to skip"})
	command.AddFlag(c, command.Flag{Syntax: "--verbose", Description: "List each repo and env file the scan skipped"})
	command.Action(c, setupAction)

	return c
}
