package onboarding

import (
	"context"
	"fmt"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/settings"
)

type Preferences struct {
	Telemetry, UpdateCheck, Shell, Agent string
	Yes                                  bool
}

func SetupPreferences(ctx context.Context, a contracts.Adapters, o Preferences, p Prompts, installAgent func() error) error {
	for _, item := range []struct {
		key, value, question string
		fallback, prompted   bool
	}{{"telemetry", o.Telemetry, "Enable anonymous telemetry?", false, true}, {"update-check", o.UpdateCheck, "Check for updates daily?", true, true}} {
		decision := DeriveConsent(item.value, o.Yes || !p.Interactive, item.fallback)
		value := decision.Value
		if decision.Kind == "ask" {
			var err error
			value, err = p.Consent(item.question, item.prompted)
			if err != nil {
				return err
			}
		}

		text := "off"
		if value {
			text = "on"
		}

		if _, err := settings.SetConfig(ctx, item.key, text, a.Home, a.Timing, p.Interactive); err != nil {
			return err
		}
	}

	shell := o.Shell
	if shell == "" && !o.Yes && p.Interactive {
		var err error
		shell, err = p.Terminal.Select(prompts.PromptOptions{Message: "Install the shell notice? It prints a line when you cd into a checkout whose env files need a push or pull", Options: []prompts.Option{{Value: "zsh", Label: "zsh"}, {Value: "bash", Label: "bash"}, {Value: "fish", Label: "fish"}, {Value: "powershell", Label: "PowerShell"}, {Value: "none", Label: "No, skip it"}}})
		if err != nil {
			return err
		}
	}

	if DeriveShell(shell) == "install" {
		if err := a.Shell(shell).Install(a.Executable); err != nil {
			_, _ = fmt.Fprintf(p.Stderr, "Skipped the shell notice: %s. Set it up later with: envden shell install\n", err)
		}
	}

	agent := DeriveAgent(o.Agent, o.Yes || !p.Interactive)
	install := agent == "install"
	if agent == "ask" {
		var err error
		install, err = p.Consent("Install the agent skill? It teaches AI coding agents like Claude Code and Codex to use envden safely", true)
		if err != nil {
			return err
		}
	}

	if install && installAgent != nil {
		if err := installAgent(); err != nil {
			_, _ = fmt.Fprintf(p.Stderr, "Skipped the agent skill: %s. Set it up later with: envden agent install\n", err)
		}
	}

	return nil
}

func UpdatePreferences(ctx context.Context, a contracts.Adapters, o Preferences, p Prompts, installAgent func() error) error {
	config, err := settings.ReadConfig(a.Home)
	if err != nil {
		return err
	}

	o.Yes = true
	if o.Telemetry == "" {
		o.Telemetry = "off"
		if config.Telemetry {
			o.Telemetry = "on"
		}
	}

	if o.UpdateCheck == "" {
		o.UpdateCheck = "off"
		if config.UpdateCheck {
			o.UpdateCheck = "on"
		}
	}

	return SetupPreferences(ctx, a, o, p, installAgent)
}
