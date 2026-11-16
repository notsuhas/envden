package program

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/notice"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/telemetry"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/updates"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/spf13/cobra"
)

type RunOptions struct {
	Binary         string
	Stdout, Stderr io.Writer
	Interactive    bool
	Env            map[string]string
	Notice         notice.Hooks
	Telemetry      func(string)
}

func Run(ctx context.Context, a contracts.Adapters, args []string, o RunOptions) error {
	if o.Stdout == nil {
		o.Stdout = os.Stdout
	}

	if o.Stderr == nil {
		o.Stderr = os.Stderr
	}

	defaults := notice.DefaultHooks(o.Stderr)
	if o.Notice.Pending == nil {
		o.Notice.Pending = defaults.Pending
	}

	if o.Notice.Remote == nil {
		o.Notice.Remote = defaults.Remote
	}

	ctx = output.WithCommandCounts(ctx)
	p := CreateProgram()
	p.SetOut(o.Stdout)
	p.SetErr(o.Stderr)
	var active *cobra.Command
	env := runtime.Environment{Binary: o.Binary, Adapters: a, Context: ctx, Interactive: o.Interactive, Env: o.Env}
	runtime.Bind(p, env)
	defer runtime.Release(p)
	p.PersistentPreRunE = func(c *cobra.Command, _ []string) error {
		root := c.Root()
		if err := SetExecutionRoots(a.Home)(root, c); err != nil {
			return err
		}

		if c.Name() != "status" || command.Values(c)["refreshCache"] != true {
			active = c
		}

		if output.SkipsNotices(c.Name(), command.Values(c)["json"] == true) {
			return nil
		}

		cwd, _ := os.Getwd()
		result := notice.CommandNotice(env.Context, a, a.Now(), false, cwd, false, o.Env, o.Notice)
		for _, repo := range result.Repos {
			_, _ = fmt.Fprintln(p.ErrOrStderr(), "envden: "+repo+" out of sync")
		}

		if result.Update.Available {
			_, _ = fmt.Fprintln(p.ErrOrStderr(), "envden: update available; run envden update")
		}

		if result.Update.Required {
			_, _ = fmt.Fprintln(p.ErrOrStderr(), "envden: update required; run envden update")
		}

		return nil
	}

	return updates.WithUpdateStatus(ctx, a.Home, func(ctx context.Context) error {
		env.Context = ctx
		runtime.Bind(p, env)

		return telemetry.CommandOutcome(func() error { _, err := command.Execute(p, args); return err }, func(event telemetry.Event) {
			if active == nil {
				return
			}

			event.Command = commandName(active)
			if counts := output.CommandCounts(ctx); counts != nil {
				event.Changed = counts.Changed
				event.Conflicts = counts.Conflicts
			}

			send := o.Telemetry
			if send == nil {
				send = func(body string) { telemetry.SendInBackground(a.Executable, body, o.Env) }
			}

			telemetry.ReportTelemetry(ctx, a, event, o.Env, send)
		})
	})
}

func commandName(c *cobra.Command) string {
	parts := []string{c.Name()}
	for c = c.Parent(); c != nil && c.Parent() != nil; c = c.Parent() {
		parts = append([]string{c.Name()}, parts...)
	}

	return strings.Join(parts, " ")
}

func RecordFailure(a contracts.Adapters, err error) error {
	if errors.Is(err, errors.ClientTooOld) {
		return updates.RecordUpdateRequired(a.Home, err, a.Now)
	}

	return nil
}
