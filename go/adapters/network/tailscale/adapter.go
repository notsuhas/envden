package tailscale

import (
	"fmt"
	"unicode/utf16"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/textcase"
)

type CommandResult struct {
	ExitCode       int
	Stdout, Stderr string
}

type Runner func([]string) (CommandResult, error)

type adapter struct{ run Runner }

func CreateTailscaleNetworkAdapter(runners ...Runner) adapters.Network {
	run := runCommand
	if len(runners) > 0 && runners[0] != nil {
		run = runners[0]
	}

	return &adapter{run}
}

func (a *adapter) ID() string { return "tailscale" }

func (a *adapter) Status() (adapters.NetworkStatus, error) {
	r, err := a.run([]string{"status", "--json"})
	if err != nil {
		return unavailable("not-installed"), nil //nolint:nilerr // Command failure is a network status, matching TS.
	}
	if r.ExitCode != 0 {
		return unavailable("not-running"), nil
	}
	s, err := parseStatus(r.Stdout)
	if err != nil {
		return unavailable("unreadable"), nil //nolint:nilerr // Invalid status JSON is a network status, matching TS.
	}

	return s, nil
}

func (a *adapter) CheckHTTPSCertificate() (adapters.HTTPSCheck, error) {
	s, e := a.Status()

	return adapters.HTTPSCheck{Ready: s.Problem == nil, Problem: s.Problem}, e
}

func (a *adapter) command(args []string, summary string) (string, error) {
	r, err := a.run(args)
	if err != nil {
		return "", errors.Wrap(errors.Internal, summary, err)
	}
	if r.ExitCode != 0 {
		detail := utf16.Encode([]rune(textcase.Trim(r.Stderr)))
		if len(detail) > 500 {
			detail = detail[:500]
		}
		if len(detail) > 0 {
			summary += ": " + string(utf16.Decode(detail))
		}

		return "", errors.New(errors.Internal, summary)
	}

	return r.Stdout, nil
}

func (a *adapter) Expose(port int) (string, error) {
	if port < 1 || port > 65535 {
		return "", errors.New(errors.InvalidInput, "Invalid port")
	}
	s, _ := a.Status()
	if s.Problem != nil {
		return "", errors.New(errors.Conflict, s.Problem.Message)
	}
	if s.Hostname == "" {
		return "", errors.New(errors.Conflict, "Tailscale is not ready")
	}
	target := fmt.Sprintf("http://127.0.0.1:%d", port)
	current, err := a.command([]string{"serve", "status", "--json"}, "Tailscale serve status failed")
	if err != nil {
		return "", err
	}
	conflict, err := serveConflict(current, s.Hostname, port, target)
	if err != nil {
		return "", err
	}
	if conflict {
		return "", errors.New(errors.Conflict, fmt.Sprintf("Tailscale already serves something else on port %d. See it with tailscale serve status, and remove it with tailscale serve --https=%d off", port, port))
	}
	if _, err = a.command([]string{"serve", "--bg", fmt.Sprintf("--https=%d", port), target}, "Tailscale serve failed"); err != nil {
		return "", err
	}

	return fmt.Sprintf("https://%s:%d", s.Hostname, port), nil
}
