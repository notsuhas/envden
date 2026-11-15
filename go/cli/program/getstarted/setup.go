package getstarted

import (
	"github.com/notsuhas/envden/go/lib/commander"
)

func SetupCommand() *commander.Command {
	c := commander.New("setup").Description("Create a vault and configure this device")
	c.AddOption(commander.NewOption("--yes", "Take defaults; secrets and checkout approval still require your terminal"))
	c.AddOption(commander.NewOption("--server <url>", "Use this server"))
	c.AddOption(commander.NewOption("--kit-out <file>", "Write the recovery kit as JSON to a private file instead of a PDF"))
	c.AddOption(commander.NewOption("--name <name>", "Device name"))
	c.AddOption(commander.NewOption("--host-server", "Run the envden server on this machine; no setup token needed"))
	c.AddOption(commander.NewOption("--setup-token <token>", "Setup token, visible to other processes; use the prompt in a terminal"))
	c.AddOption(commander.NewOption("--telemetry <choice>", "Anonymous telemetry").Choices("on", "off"))
	c.AddOption(commander.NewOption("--update-check <choice>", "Daily update check").Choices("on", "off"))
	c.AddOption(commander.NewOption("--shell <shell>", "Shell notice").Choices("zsh", "bash", "fish", "powershell", "none"))
	c.AddOption(commander.NewOption("--agent <choice>", "Install the agent skill").Choices("on", "off"))
	c.AddOption(commander.NewOption("--scan-root <path...>", "Roots to scan for repos"))
	c.AddOption(commander.NewOption("--exclude-root <path...>", "Roots to skip"))
	c.AddOption(commander.NewOption("--verbose", "List each repo and env file the scan skipped"))
	c.Action(setupAction)

	return c
}
