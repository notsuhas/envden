package command

import (
	"errors"
	"fmt"
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
	coreerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

func Execute(root *cobra.Command, args []string) (*Invocation, error) {
	if root.Version != "" {
		for _, arg := range args {
			if arg == "--" {
				break
			}
			if arg == "--version" || strings.HasPrefix(arg, "-V") {
				args = []string{"--version"}
				break
			}
		}
	}
	prepared, err := prepare(root, args)
	if err != nil {
		if _, ok := coreerrors.As(err); ok {
			return nil, err
		}
		return nil, report(root, err)
	}
	root.SetArgs(prepared)
	var invocation *Invocation
	var configure func(*cobra.Command)
	configure = func(c *cobra.Command) {
		original := c.Args
		c.Args = func(cmd *cobra.Command, args []string) error {
			var err error
			if cmd.HasSubCommands() {
				if len(args) > 0 {
					err = fmt.Errorf("unknown command %q for %s", args[0], cmd.CommandPath())
				} else {
					writer := cmd.OutOrStdout()
					cmd.SetOut(cmd.ErrOrStderr())
					_ = cmd.Help()
					cmd.SetOut(writer)
					err = fmt.Errorf("command required for %s", cmd.Name())
				}
			} else {
				err = validateArgs(cmd, args, original)
			}
			if err != nil {
				return &ExitError{1, err.Error()}
			}
			invocation = &Invocation{Command: cmd, Args: arguments(cmd, args), Values: Values(cmd)}
			return nil
		}
		c.SetFlagErrorFunc(func(_ *cobra.Command, err error) error {
			var failure error
			c.Flags().VisitAll(func(f *pflag.Flag) {
				if v, ok := f.Value.(*flagValue); ok && v.failure != nil {
					failure = v.failure
				}
			})
			if failure != nil {
				var invalid *InvalidArgumentError
				if !errors.As(failure, &invalid) {
					return failure
				}
			}
			return &ExitError{1, err.Error()}
		})
		for _, child := range c.Commands() {
			configure(child)
		}
	}
	configure(root)
	_, err = root.ExecuteC()
	var exit *ExitError
	if errors.As(err, &exit) {
		return invocation, report(root, err)
	}
	return invocation, err
}

func report(c *cobra.Command, err error) error {
	var exit *ExitError
	if !errors.As(err, &exit) {
		exit = &ExitError{1, err.Error()}
	}
	_, _ = fmt.Fprintln(c.ErrOrStderr(), output.SanitizeTerminal(exit.Message))
	return exit
}
