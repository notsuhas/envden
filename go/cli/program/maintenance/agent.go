package maintenance

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func AgentCommand() *commander.Command {
	c := commander.New("agent").Description("Install the envden agent skill")
	c0 := commander.New("install").Description("Install or refresh the agent skill")
	c0.Action(stub.Action)
	c.AddCommand(c0)
	return c
}
