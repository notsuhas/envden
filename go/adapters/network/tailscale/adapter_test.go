package tailscale

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestStatusAndCLI(t *testing.T) {
	calls := [][]string{}
	a := CreateTailscaleNetworkAdapter(func(args []string) (CommandResult, error) {
		calls = append(calls, args)
		out := fixture(t)
		if args[0] == "serve" {
			out = "{}"
		}

		return CommandResult{Stdout: out}, nil
	})
	s, e := a.Status()
	if e != nil || !s.Ready || s.Hostname != "laptop.tail.example" {
		t.Fatal(s, e)
	}
	if _, e = a.CheckHTTPSCertificate(); e != nil {
		t.Fatal(e)
	}
	url, e := a.Expose(3000)
	if e != nil || url != "https://laptop.tail.example:3000" {
		t.Fatal(url, e)
	}
	want := [][]string{{"serve", "status", "--json"}, {"serve", "--bg", "--https=3000", "http://127.0.0.1:3000"}}
	if !reflect.DeepEqual(calls[len(calls)-2:], want) {
		t.Fatal(calls)
	}
}

func TestStatusSchema(t *testing.T) {
	for _, row := range []struct{ raw, kind string }{{"[]", "unreadable"}, {`{"BackendState":42}`, "unreadable"}, {`{"BackendState":"NeedsLogin"}`, "logged-out"}, {`{"BackendState":"Stopped"}`, "not-running"}, {`{"BackendState":"Running","Self":{"DNSName":4},"CertDomains":[4]}`, "https-disabled"}, {`{"BackendState":"Running","Self":null,"CertDomains":null}`, "https-disabled"}} {
		a := CreateTailscaleNetworkAdapter(func([]string) (CommandResult, error) { return CommandResult{Stdout: row.raw}, nil })
		s, _ := a.Status()
		if s.Problem == nil || s.Problem.Kind != row.kind {
			t.Fatal(row, s)
		}
	}
}

func TestServeConflict(t *testing.T) {
	host := "laptop.tail.example"
	port := 4280
	target := "http://127.0.0.1:4280"
	site := func(handlers map[string]any) string {
		b, _ := json.Marshal(map[string]any{"TCP": map[string]any{"4280": map[string]any{"HTTPS": true}}, "Web": map[string]any{host + ":4280": map[string]any{"Handlers": handlers}}})

		return string(b)
	}
	for _, row := range []struct {
		out      string
		conflict bool
	}{{"{}", false}, {"", false}, {"null", false}, {site(map[string]any{"/": map[string]any{"Proxy": target}}), false}, {site(map[string]any{"/": map[string]any{"Proxy": "other"}}), true}, {site(map[string]any{"/": map[string]any{"Proxy": target}, "/app": map[string]any{"Proxy": target}}), true}, {`{"TCP":{"4280":{"TCPForward":"127.0.0.1:22"}}}`, true}, {`{"TCP":{"4280":{"HTTPS":true}}}`, true}, {`{"Web":{"x:443":{"Handlers":{"/":{"Proxy":"x"}}}}}`, false}} {
		got, e := serveConflict(row.out, host, port, target)
		if e != nil || got != row.conflict {
			t.Fatal(row, got, e)
		}
	}
	for _, out := range []string{"bad json", "[]", `{"TCP":null}`, `{"TCP":{"1":{"TCPForward":null}}}`, `{"Web":{"x":{}}}`, `{"Web":{"x":{"Handlers":{"/":null}}}}`} {
		if _, e := serveConflict(out, host, port, target); !errors.Is(e, errors.InvalidData) {
			t.Fatal(out, e)
		}
	}
}

func TestServeErrorCapAndOccupied(t *testing.T) {
	hint := "Serve is not enabled on your tailnet. To enable, visit: https://login.tailscale.com/f/serve"
	a := CreateTailscaleNetworkAdapter(func(args []string) (CommandResult, error) {
		if args[0] != "serve" {
			return CommandResult{Stdout: fixture(t)}, nil
		}
		if args[1] == "status" {
			return CommandResult{Stdout: "{}"}, nil
		}

		return CommandResult{ExitCode: 1, Stderr: hint + "\n" + strings.Repeat("x", 2000)}, nil
	})
	_, e := a.Expose(4280)
	if e == nil || !strings.Contains(e.Error(), hint) || len(e.Error()) >= 600 {
		t.Fatal(e)
	}
	published := false
	a = CreateTailscaleNetworkAdapter(func(args []string) (CommandResult, error) {
		if args[0] != "serve" {
			return CommandResult{Stdout: fixture(t)}, nil
		}
		if args[1] == "--bg" {
			published = true
		}

		return CommandResult{Stdout: `{"Web":{"laptop.tail.example:4280":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:9000"}}}}}`}, nil
	})
	_, e = a.Expose(4280)
	if !errors.Is(e, errors.Conflict) || published {
		t.Fatal(e, published)
	}
}
