package access

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/onboarding"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/lib/clack"
	"github.com/notsuhas/envden/go/lib/commander"
	"io"
	"os"
	"path/filepath"
	"time"
)

var SetupEffects onboarding.Effects
var JoinEffects onboarding.JoinEffects

func Runtime(inv *commander.Invocation) (contracts.Adapters, onboarding.Prompts, io.Writer, error) {
	stdout, stderr := Writers(inv.Command)
	env, err := runtime.Get(inv)
	a := env.Adapters
	if home, e := filepath.EvalSymlinks(a.UserHome); e == nil {
		a.UserHome = home
	}
	p := onboarding.Prompts{Interactive: env.Interactive, Terminal: clack.New(os.Stdin, stdout), Stderr: stderr}
	return a, p, stdout, err
}

func Writers(c *commander.Command) (io.Writer, io.Writer) {
	var stdout, stderr io.Writer
	for ; c != nil; c = c.Parent {
		if stdout == nil {
			stdout = c.Stdout
		}
		if stderr == nil {
			stderr = c.Stderr
		}
	}
	if stdout == nil {
		stdout = os.Stdout
	}
	if stderr == nil {
		stderr = os.Stderr
	}
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

func String(v map[string]any, key string) string    { value, _ := v[key].(string); return value }
func Bool(v map[string]any, key string) bool        { value, _ := v[key].(bool); return value }
func Strings(v map[string]any, key string) []string { value, _ := v[key].([]string); return value }

func Preferences(v map[string]any) onboarding.Preferences {
	return onboarding.Preferences{Telemetry: String(v, "telemetry"), UpdateCheck: String(v, "updateCheck"), Shell: String(v, "shell"), Agent: String(v, "agent"), Yes: Bool(v, "yes")}
}
