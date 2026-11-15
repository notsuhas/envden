package maintenance

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func ConfigCommand() *commander.Command {
	c := commander.New("config").Description("Read or change settings")
	c.AddArgument(commander.NewArgument("[key]", "telemetry, update-check, agent-merge, auto-approve-worktrees, unlock-period, placement or env-files"))
	c.AddArgument(commander.NewArgument("[values...]", "New value; placement takes a checkout path and link or copy"))
	c.Action(stub.Action)
	return c
}
