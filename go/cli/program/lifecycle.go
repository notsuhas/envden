package program

import (
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/notice"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/telemetry"
	runtime "github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/updates"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
	"io"
	"os"
	"strings"
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
	p.Stdout = o.Stdout
	p.Stderr = o.Stderr
	var active *commander.Command
	env := runtime.Environment{Binary: o.Binary, Adapters: a, Context: ctx, Interactive: o.Interactive, Env: o.Env}
	runtime.Bind(p, env)
	defer runtime.Release(p)
	p.Hook("preAction", func(root, c *commander.Command) error {
		if err := SetExecutionRoots(a.Home)(root, c); err != nil {
			return err
		}
		if c.CommandName != "status" || !containsFlag(args, "--refresh-cache") {
			active = c
		}
		if output.SkipsNotices(c.CommandName, containsFlag(args, "--json")) {
			return nil
		}
		cwd, _ := os.Getwd()
		result := notice.CommandNotice(env.Context, a, a.Now(), false, cwd, false, o.Env, o.Notice)
		for _, repo := range result.Repos {
			fmt.Fprintln(p.Stderr, "envden: "+repo+" out of sync")
		}
		if result.Update.Available {
			fmt.Fprintln(p.Stderr, "envden: update available; run envden update")
		}
		if result.Update.Required {
			fmt.Fprintln(p.Stderr, "envden: update required; run envden update")
		}
		return nil
	})
	return updates.WithUpdateStatus(ctx, a.Home, func(ctx context.Context) error {
		env.Context = ctx
		runtime.Bind(p, env)
		return telemetry.CommandOutcome(func() error { _, err := p.Parse(args); return err }, func(event telemetry.Event) {
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

func containsFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == flag {
			return true
		}
	}
	return false
}
func commandName(c *commander.Command) string {
	parts := []string{c.CommandName}
	for c = c.Parent; c != nil && c.Parent != nil; c = c.Parent {
		parts = append([]string{c.CommandName}, parts...)
	}
	return strings.Join(parts, " ")
}

func RecordFailure(a contracts.Adapters, err error) error {
	if errors.Is(err, errors.ClientTooOld) {
		return updates.RecordUpdateRequired(a.Home, err, a.Now)
	}
	return nil
}
