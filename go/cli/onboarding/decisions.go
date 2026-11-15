package onboarding

import (
	"github.com/notsuhas/envden/go/core/errors"
	"net/url"
	"regexp"
	"strings"
)

const addressHint = "Not a server address. Use one like envden.your-tailnet.ts.net"

var addressScheme = regexp.MustCompile(`(?i)^[a-z][a-z\d+.-]*://`)

type ConsentDecision struct {
	Kind  string
	Value bool
}

func DeriveConsent(value string, yes, fallback bool) ConsentDecision {
	if value != "" {
		return ConsentDecision{"selected", value == "on"}
	}
	if yes {
		return ConsentDecision{"selected", fallback}
	}
	return ConsentDecision{Kind: "ask"}
}

func DeriveShell(shell string) string {
	switch shell {
	case "zsh", "bash", "fish", "powershell":
		return "install"
	}
	return "skip"
}

func DeriveAgent(agent string, yes bool) string {
	if agent == "on" {
		return "install"
	}
	if agent == "" && !yes {
		return "ask"
	}
	return "skip"
}

func RequireServerAddress(text string) (string, error) {
	candidate := strings.TrimSpace(text)
	if !addressScheme.MatchString(candidate) {
		candidate = "https://" + candidate
	}
	parsed, err := url.Parse(candidate)
	if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return "", errors.New(errors.InvalidInput, addressHint)
	}
	host := strings.ToLower(parsed.Host)
	if parsed.Scheme == "https" && parsed.Port() == "443" {
		host = strings.TrimSuffix(host, ":443")
	}
	if parsed.Scheme == "http" && parsed.Port() == "80" {
		host = strings.TrimSuffix(host, ":80")
	}
	return parsed.Scheme + "://" + host, nil
}

func AddressProblem(text string) string {
	if _, err := RequireServerAddress(text); err != nil {
		return addressHint
	}
	return ""
}
