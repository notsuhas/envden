package onboarding

import (
	"bytes"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestDecisions(t *testing.T) {
	for _, row := range []struct {
		value         string
		yes, fallback bool
		kind          string
		selected      bool
	}{{"on", false, false, "selected", true}, {"off", true, true, "selected", false}, {"", true, true, "selected", true}, {"", true, false, "selected", false}, {"", false, true, "ask", false}} {
		got := DeriveConsent(row.value, row.yes, row.fallback)
		if got.Kind != row.kind || got.Value != row.selected {
			t.Fatal(row, got)
		}
	}

	for _, row := range []struct {
		agent string
		yes   bool
		kind  string
	}{{"on", true, "install"}, {"off", false, "skip"}, {"", true, "skip"}, {"", false, "ask"}} {
		if got := DeriveAgent(row.agent, row.yes); got != row.kind {
			t.Fatal(row, got)
		}
	}

	for _, row := range []struct{ input, want string }{{"envden.x.ts.net", "https://envden.x.ts.net"}, {" envden.x.ts.net/ ", "https://envden.x.ts.net"}, {"https://envden.x.ts.net/v1", "https://envden.x.ts.net"}, {"http://127.0.0.1:4783", "http://127.0.0.1:4783"}} {
		got, err := RequireServerAddress(row.input)
		if err != nil || got != row.want {
			t.Fatal(row, got, err)
		}
	}

	for _, bad := range []string{"", "https://", "ftp://envden.x.ts.net", "envden x"} {
		if _, err := RequireServerAddress(bad); !errors.Is(err, errors.InvalidInput) {
			t.Fatal(bad, err)
		}
	}
}

func TestPasswordAttempts(t *testing.T) {
	answers := []string{"first", "wrong", "second", "second"}
	labels := []string{}
	var stderr bytes.Buffer
	password, err := ConfirmedPassword(func(label string) (string, error) {
		labels = append(labels, label)
		value := answers[0]
		answers = answers[1:]

		return value, nil
	}, 3, &stderr)
	if err != nil || password != "second" || len(labels) != 4 || stderr.String() != "The passwords don't match. Enter them again.\n" {
		t.Fatal(password, labels, stderr.String(), err)
	}

	_, err = ConfirmedPassword(func(string) (string, error) { return "", nil }, 1, &stderr)
	if !errors.Is(err, errors.InvalidInput) {
		t.Fatal(err)
	}
}

func TestPromptRefusesNoTTY(t *testing.T) {
	p := Prompts{}
	_, err := p.Secret("Master password", nil)
	if !errors.Is(err, errors.InvalidInput) || err.Error() != "Master password needs a terminal. Run this command in your own terminal" {
		t.Fatal(err)
	}
}
