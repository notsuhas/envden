package maintenance

import "github.com/notsuhas/envden/go/cli/program/runtime"
import "github.com/notsuhas/envden/go/cli/agent"
import "github.com/notsuhas/envden/go/lib/commander"

func AgentCommand() *commander.Command {
	c := commander.New("agent").Description("Install the envden agent skill")
	c0 := commander.New("install").Description("Install or refresh the agent skill")
	c0.Action(func(i *commander.Invocation) error {
		env, e := runtime.Get(i)
		if e != nil {
			return e
		}
		if e = agent.InstallAgent(env.Adapters.UserHome, env.Adapters.Now); e != nil {
			return e
		}
		return runtime.Print(i, "Agent skill installed")
	})
	c.AddCommand(c0)
	return c
}
