package command

import (
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

type Invocation struct {
	Command *cobra.Command
	Args    []string
	Values  map[string]any
}

type ExitError struct {
	ExitCode int
	Message  string
}

func (e *ExitError) Error() string { return e.Message }

type InvalidArgumentError struct{ Message string }

func (e *InvalidArgumentError) Error() string { return e.Message }

func New(name, description string) *cobra.Command {
	c := &cobra.Command{Use: name, Short: description, SilenceErrors: true, SilenceUsage: true, TraverseChildren: true}
	c.CompletionOptions.DisableDefaultCmd = true
	c.RunE = func(*cobra.Command, []string) error { return nil }
	return c
}

func Action(c *cobra.Command, action func(*Invocation) error) {
	c.RunE = func(c *cobra.Command, args []string) error {
		return action(&Invocation{Command: c, Args: arguments(c, args), Values: Values(c)})
	}
	if c.Args == nil {
		c.Args = cobra.NoArgs
	}
}

func Values(c *cobra.Command) map[string]any {
	values := map[string]any{}
	c.Flags().VisitAll(func(f *pflag.Flag) {
		if v, ok := f.Value.(*flagValue); ok && (f.Changed || v.spec.Negate) {
			values[key(f.Name)] = v.value
		}
	})
	return values
}

func key(name string) string {
	parts := strings.Split(strings.TrimPrefix(name, "no-"), "-")
	for i := 1; i < len(parts); i++ {
		parts[i] = strings.ToUpper(parts[i][:1]) + parts[i][1:]
	}
	return strings.Join(parts, "")
}
