package program

import (
	"bytes"
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestMaintenanceLifecycle(t *testing.T) {
	home := t.TempDir()
	now := func() int64 { return 1800000000000 }
	a := contracts.Adapters{Home: home, UserHome: home, Now: now, Timing: lock.Timing{Now: now, Delays: []int64{}}, Fetcher: func(*http.Request) (*http.Response, error) { t.Fatal("network called"); return nil, nil }}
	for _, r := range []struct {
		args []string
		want string
		code errors.Code
	}{{[]string{"version"}, "0.3.8\n", ""}, {[]string{"status", "--json"}, "{\"configured\":false,\"update\":{\"available\":false,\"required\":false}}\n", ""}, {[]string{"config", "telemetry", "off"}, "telemetry: off\n", ""}, {[]string{"config", "bad"}, "", errors.InvalidInput}, {[]string{"config", "agent-merge", "on"}, "", errors.InvalidInput}} {
		var stdout, stderr bytes.Buffer
		e := Run(context.Background(), a, r.args, RunOptions{Stdout: &stdout, Stderr: &stderr, Env: map[string]string{"ENVDEN_NO_UPDATE_CHECK": "1"}})
		if r.code != "" {
			if !errors.Is(e, r.code) {
				t.Fatal(r.args, e)
			}
		} else if e != nil {
			t.Fatal(r.args, e)
		}
		if stdout.String() != r.want || stderr.Len() != 0 {
			t.Fatal(r.args, stdout.String(), stderr.String())
		}
	}
}

func TestNoTelemetryForHelpOrCacheRefresh(t *testing.T) {
	previous := settings.TelemetryKey
	settings.TelemetryKey = "test"
	defer func() { settings.TelemetryKey = previous }()
	home := t.TempDir()
	now := func() int64 { return 1800000000000 }
	a := contracts.Adapters{Home: home, UserHome: home, Now: now, Timing: lock.Timing{Now: now, Delays: []int64{}}}
	if e := files.PrivateDirectory(home); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(home, "config.json"), []byte(`{"telemetry":true}`), 0600); e != nil {
		t.Fatal(e)
	}
	sent := []string{}
	for _, args := range [][]string{{"--help"}, {"version"}, {"status", "--refresh-cache"}} {
		var stdout, stderr bytes.Buffer
		e := Run(context.Background(), a, args, RunOptions{Stdout: &stdout, Stderr: &stderr, Env: map[string]string{"ENVDEN_NO_UPDATE_CHECK": "1"}, Telemetry: func(body string) { sent = append(sent, body) }})
		if e != nil && args[0] != "--help" {
			t.Fatal(e)
		}
	}
	if len(sent) != 1 {
		t.Fatal(sent)
	}
}
