package runtime

import (
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
	"io"
	"os"
	"sync"
)

type Environment struct {
	Binary      string
	Adapters    contracts.Adapters
	Context     context.Context
	Interactive bool
	Env         map[string]string
}

var environments sync.Map

func Bind(command *commander.Command, env Environment) { environments.Store(command, env) }
func Release(command *commander.Command)               { environments.Delete(command) }
func Get(i *commander.Invocation) (Environment, error) {
	c := i.Command
	for c.Parent != nil {
		c = c.Parent
	}
	if env, ok := environments.Load(c); ok {
		return env.(Environment), nil
	}
	return Environment{}, errors.New(errors.Internal, "Command runtime is not configured")
}
func Writer(c *commander.Command, stderr bool) io.Writer {
	for ; c != nil; c = c.Parent {
		if stderr && c.Stderr != nil {
			return c.Stderr
		}
		if !stderr && c.Stdout != nil {
			return c.Stdout
		}
	}
	if stderr {
		return os.Stderr
	}
	return os.Stdout
}
func Print(i *commander.Invocation, text string) error {
	_, e := fmt.Fprintln(Writer(i.Command, false), output.SanitizeConsole(text))
	return e
}
func Context(i *commander.Invocation) context.Context {
	env, err := Get(i)
	if err != nil || env.Context == nil {
		return context.Background()
	}
	return env.Context
}
