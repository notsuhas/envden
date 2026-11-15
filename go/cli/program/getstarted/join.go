package getstarted

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func JoinCommand() *commander.Command {
	c := commander.New("join").Description("Join using a pairing code or recovery kit in your own terminal")
	c.AddOption(commander.NewOption("--recovery", "Paste a recovery secret key and vault ID"))
	c.AddOption(commander.NewOption("--recovery-kit <path>", "Recovery kit path"))
	c.AddOption(commander.NewOption("--name <name>", "Device name"))
	c.AddOption(commander.NewOption("--yes", "Use default preferences"))
	c.AddOption(commander.NewOption("--telemetry <choice>", "Anonymous telemetry").Choices("on", "off"))
	c.AddOption(commander.NewOption("--update-check <choice>", "Daily update check").Choices("on", "off"))
	c.AddOption(commander.NewOption("--shell <shell>", "Shell notice").Choices("zsh", "bash", "fish", "powershell", "none"))
	c.AddOption(commander.NewOption("--agent <choice>", "Install the agent skill").Choices("on", "off"))
	c.AddOption(commander.NewOption("--resume", "Finish a join that was approved while this command wasn't running"))
	c.AddArgument(commander.NewArgument("<server>", "Server address, e.g. envden.your-tailnet.ts.net"))
	c.Action(stub.Action)
	return c
}
