package tailscale

import (
	"encoding/json"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

var messages = map[string]string{
	"not-installed":  "Tailscale isn't installed. Get it from https://tailscale.com/download",
	"not-running":    "Tailscale isn't running. Start it, then try again",
	"logged-out":     "Log in to Tailscale with tailscale up, then try again",
	"https-disabled": "Enable HTTPS certificates in the Tailscale admin console: https://login.tailscale.com/admin/dns",
	"unreadable":     "Tailscale's status couldn't be read. Run tailscale status to check it",
}

func problem(kind string) *adapters.NetworkProblem {
	return &adapters.NetworkProblem{Kind: kind, Message: messages[kind]}
}

func unavailable(kind string) adapters.NetworkStatus {
	return adapters.NetworkStatus{Problem: problem(kind)}
}

func object(raw json.RawMessage) (map[string]json.RawMessage, bool) {
	var m map[string]json.RawMessage
	err := json.Unmarshal(raw, &m)

	return m, err == nil && m != nil
}

func text(raw json.RawMessage) (string, bool) {
	var s string
	if len(raw) == 0 || raw[0] != '"' {
		return "", false
	}
	err := json.Unmarshal(raw, &s)

	return s, err == nil
}

func parseStatus(stdout string) (adapters.NetworkStatus, error) {
	m, ok := object([]byte(stdout))
	state, valid := text(m["BackendState"])
	if !ok || !valid {
		return adapters.NetworkStatus{}, errors.New(errors.InvalidData, "Invalid Tailscale status")
	}
	s := adapters.NetworkStatus{Running: state == "Running", LoggedIn: state != "NeedsLogin" && state != "NoState"}
	if self, ok := object(m["Self"]); ok {
		if dns, ok := text(self["DNSName"]); ok {
			s.Hostname = strings.TrimSuffix(dns, ".")
			s.HasHostname = true
		}
	}
	var domains []json.RawMessage
	if json.Unmarshal(m["CertDomains"], &domains) == nil {
		valid := true
		matched := false
		for _, v := range domains {
			name, ok := text(v)
			if !ok {
				valid = false
			}
			if s.HasHostname && name == s.Hostname {
				matched = true
			}
		}
		s.HTTPSEnabled = valid && matched
	}
	if !s.LoggedIn {
		s.Problem = problem("logged-out")
	} else if !s.Running {
		s.Problem = problem("not-running")
	} else if !s.HTTPSEnabled {
		s.Problem = problem("https-disabled")
	}
	s.Ready = s.Problem == nil

	return s, nil
}
