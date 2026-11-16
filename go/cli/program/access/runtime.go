package access

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/onboarding"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/spf13/cobra"
)

var SetupEffects onboarding.Effects

var JoinEffects onboarding.JoinEffects

func Runtime(inv *command.Invocation) (contracts.Adapters, onboarding.Prompts, io.Writer, error) {
	stdout, stderr := Writers(inv.Command)
	env, err := runtime.Get(inv)
	a := env.Adapters
	if home, e := filepath.EvalSymlinks(a.UserHome); e == nil {
		a.UserHome = home
	}

	p := onboarding.Prompts{Interactive: env.Interactive, Terminal: prompts.New(os.Stdin, stdout), Stderr: stderr}

	return a, p, stdout, err
}

func Writers(c *cobra.Command) (io.Writer, io.Writer) {
	stdout, stderr := c.OutOrStdout(), c.ErrOrStderr()

	if wrapped, ok := stdout.(output.TerminalWriter); ok {
		stdout = wrapped.Writer
	}

	if wrapped, ok := stderr.(output.TerminalWriter); ok {
		stderr = wrapped.Writer
	}

	return stdout, stderr
}

func Pause(ctx context.Context) error {
	timer := time.NewTimer(500 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func String(v map[string]any, key string) string { value, _ := v[key].(string); return value }

func Bool(v map[string]any, key string) bool { value, _ := v[key].(bool); return value }

func Strings(v map[string]any, key string) []string { value, _ := v[key].([]string); return value }

func Preferences(v map[string]any) onboarding.Preferences {
	return onboarding.Preferences{Telemetry: String(v, "telemetry"), UpdateCheck: String(v, "updateCheck"), Shell: String(v, "shell"), Agent: String(v, "agent"), Yes: Bool(v, "yes")}
}
