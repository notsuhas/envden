package runtime

import (
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/spf13/cobra"
)

type Environment struct {
	Binary      string
	Adapters    contracts.Adapters
	Context     context.Context
	Interactive bool
	Env         map[string]string
}

var environments sync.Map

func Bind(command *cobra.Command, env Environment) { environments.Store(command, env) }

func Release(command *cobra.Command) { environments.Delete(command) }

func Get(i *command.Invocation) (Environment, error) {
	c := i.Command
	for c.Parent() != nil {
		c = c.Parent()
	}

	if env, ok := environments.Load(c); ok {
		return env.(Environment), nil
	}

	return Environment{}, errors.New(errors.Internal, "Command runtime is not configured")
}

func Writer(c *cobra.Command, stderr bool) io.Writer {
	if stderr {
		return c.ErrOrStderr()
	}
	return c.OutOrStdout()
}

func Print(i *command.Invocation, text string) error {
	_, e := fmt.Fprintln(Writer(i.Command, false), output.SanitizeConsole(text))

	return e
}

func Context(i *command.Invocation) context.Context {
	env, err := Get(i)
	if err != nil || env.Context == nil {
		return context.Background()
	}

	return env.Context
}
