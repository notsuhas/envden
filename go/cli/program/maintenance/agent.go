package maintenance

import (
	"github.com/notsuhas/envden/go/cli/agent"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/spf13/cobra"
)

func AgentCommand() *cobra.Command {
	c := command.New("agent", "Install the envden agent skill")
	c0 := command.New("install", "Install or refresh the agent skill")
	command.Action(c0, func(i *command.Invocation) error {
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
