package getstarted

import (
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/admin/rejoin"
	"github.com/notsuhas/envden/go/cli/agent"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/onboarding"
	"github.com/notsuhas/envden/go/cli/onboarding/report"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/access"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
	"golang.org/x/term"
	"os"
	"strings"
)

func setupOptions(v map[string]any) onboarding.SetupOptions {
	return onboarding.SetupOptions{Preferences: access.Preferences(v), Command: "setup", Server: access.String(v, "server"), SetupToken: access.String(v, "setupToken"), Name: access.String(v, "name"), KitOut: access.String(v, "kitOut"), HostServer: access.Bool(v, "hostServer"), Verbose: access.Bool(v, "verbose"), ScanRoot: access.Strings(v, "scanRoot"), ExcludeRoot: access.Strings(v, "excludeRoot")}
}

func missingSetupFlags(interactive bool, o onboarding.SetupOptions) []string {
	result := []string{}
	if interactive || o.Yes {
		return result
	}
	if o.Server == "" && !o.HostServer {
		result = append(result, "--server <url> or --host-server")
	}
	for _, item := range []struct{ value, flag string }{{o.Telemetry, "--telemetry on|off"}, {o.UpdateCheck, "--update-check on|off"}, {o.Shell, "--shell zsh|bash|fish|powershell|none"}, {o.Agent, "--agent on|off"}} {
		if item.value == "" {
			result = append(result, item.flag)
		}
	}
	if len(o.ScanRoot) == 0 {
		result = append(result, "--scan-root <path...>")
	}
	return result
}

func setupAction(inv *commander.Invocation) error {
	options := setupOptions(inv.Values)
	interactive := term.IsTerminal(int(os.Stdin.Fd()))
	if missing := missingSetupFlags(interactive, options); len(missing) > 0 {
		_, stderr := access.Writers(inv.Command)
		fmt.Fprintf(stderr, "Missing choices: %s. Or run setup in your own terminal.\n", strings.Join(missing, ", "))
		return errors.New(errors.InvalidInput, "Setup choices require your own terminal")
	}
	a, p, stdout, err := access.Runtime(inv)
	if err != nil {
		return err
	}
	effects := access.SetupEffects
	if effects.Checkouts == nil {
		effects.Checkouts = func(ctx context.Context, a contracts.Adapters, s *model.State, o onboarding.SetupOptions) error {
			return access.SetupCheckouts(ctx, a, s, o, p, stdout)
		}
	}
	if effects.InstallAgent == nil {
		effects.InstallAgent = func() error { return agent.InstallAgent(a.UserHome, a.Now) }
	}
	if effects.PushInitial == nil {
		effects.PushInitial = func(ctx context.Context, a contracts.Adapters, s *model.State) error {
			return access.Initial(ctx, a, s, p)
		}
	}
	if effects.RefreshNotice == nil {
		effects.RefreshNotice = access.RefreshNotice
	}
	if effects.ReportKit == nil {
		effects.ReportKit = func(kit vault.SetupKit, name string) error { return access.ReportKit(a, p, stdout, kit, name) }
	}
	state, err := onboarding.RunSetup(runtime.Context(inv), a, options, p, os.Stdin, stdout, effects)
	if err != nil {
		return err
	}
	for _, line := range report.SetupSummary(state, a.UserHome) {
		fmt.Fprintln(stdout, output.SanitizeTerminal(line))
	}
	return nil
}

func joinAction(inv *commander.Invocation) error {
	a, p, stdout, err := access.Runtime(inv)
	if err != nil {
		return err
	}
	address, err := onboarding.RequireServerAddress(inv.Args[0])
	if err != nil {
		return err
	}
	v := inv.Values
	options := onboarding.JoinOptions{Preferences: access.Preferences(v), RecoveryKit: access.String(v, "recoveryKit"), Name: access.String(v, "name"), Recovery: access.Bool(v, "recovery"), Resume: access.Bool(v, "resume")}
	local, err := store.LoadState(a.Home)
	if err != nil {
		return err
	}
	options.Rejoin = local != nil && local.Checkpoint != ""
	effects := access.JoinEffects
	if effects.Checkouts == nil {
		effects.Checkouts = func(ctx context.Context, a contracts.Adapters, s *model.State, o onboarding.SetupOptions) error {
			return access.SetupCheckouts(ctx, a, s, o, p, stdout)
		}
	}
	if effects.InstallAgent == nil {
		effects.InstallAgent = func() error { return agent.InstallAgent(a.UserHome, a.Now) }
	}
	if effects.FirstRun == nil {
		effects.FirstRun = func(ctx context.Context, a contracts.Adapters) error { return access.FirstRun(ctx, a, p) }
	}
	if effects.Pause == nil {
		effects.Pause = access.Pause
	}
	if options.Rejoin {
		join := func(ctx context.Context, rejoining bool) error {
			options.Rejoin = rejoining
			return onboarding.JoinVault(ctx, a, address, options, p, stdout, effects)
		}
		return rejoin.RunRejoin(runtime.Context(inv), rejoin.Options{RecoveryKit: options.RecoveryKit, Recovery: options.Recovery}, rejoin.Actions{Recovery: join, Pairing: join, Complete: func(ctx context.Context) error {
			_, err := onboarding.CompleteJoin(ctx, a, options.Preferences, p, effects)
			return err
		}})
	}
	state, err := onboarding.RunJoin(runtime.Context(inv), a, address, options, p, stdout, effects)
	if err != nil {
		return err
	}
	if !options.Rejoin {
		fmt.Fprintln(stdout, output.SanitizeTerminal(report.JoinSummary(state, a.UserHome)))
	}
	return nil
}
