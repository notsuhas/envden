package settings

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
)

func TestConfig(t *testing.T) {
	home := t.TempDir()
	timing := lock.Timing{Now: func() int64 { return 0 }}
	c, err := ReadConfig(home)
	if err != nil || c.Telemetry || !c.UpdateCheck || !c.AutoApproveWorktrees {
		t.Fatal(c, err)
	}

	for _, row := range []struct {
		key, value  string
		interactive bool
		fail        bool
	}{{"telemetry", "on", false, false}, {"bad", "on", false, true}, {"agent-merge", "on", false, true}, {"agent-merge", "off", false, false}, {"agent-merge", "on", true, false}, {"auto-approve-worktrees", "off", false, false}, {"auto-approve-worktrees", "on", false, true}, {"auto-approve-worktrees", "on", true, false}, {"env-files", `{"include":[".env*"],"exclude":["*.example"],"extraSkipped":["generated"]}`, false, false}, {"placement", `{"/checkout":"copy"}`, false, false}} {
		_, err = SetConfig(context.Background(), row.key, row.value, home, timing, row.interactive)
		if (err != nil) != row.fail {
			t.Fatalf("%v: %v", row, err)
		}
	}

	c, err = ReadConfig(home)
	if err != nil || !c.Telemetry || c.Placement == nil {
		t.Fatal(c, err)
	}

	for _, raw := range []string{`{"telemetry":"yes"}`, `{"unknown":true}`, `{"env-files":{"include":"*"}}`, `{"placement":{"/checkout":"bad"}}`} {
		if _, err = ParseConfig([]byte(raw)); !errors.Is(err, errors.InvalidInput) {
			t.Fatal(raw, err)
		}
	}

	data, _ := os.ReadFile(Paths(home).Config)
	if !strings.HasSuffix(string(data), "\n") || strings.Index(string(data), `"placement"`) > strings.Index(string(data), `"env-files"`) {
		t.Fatal(string(data))
	}
}

func TestSettingRequests(t *testing.T) {
	for _, row := range []struct {
		key    string
		values []string
		kind   string
	}{{"telemetry", nil, "read"}, {"telemetry", []string{"off"}, "set"}, {"env-files", []string{"{}"}, "set"}, {"unlock-period", []string{"7d"}, "unlock-period"}, {"placement", []string{".", "copy"}, "placement"}} {
		r, e := SettingRequest(&row.key, row.values)
		if e != nil || r.Kind != row.kind {
			t.Fatal(r, e)
		}
	}

	for _, row := range []struct {
		key    string
		values []string
	}{{"telemtry", []string{"off"}}, {"unlock-period", []string{"2d"}}, {"telemetry", []string{"yes"}}, {"telemetry", []string{"on", "off"}}, {"placement", []string{"."}}} {
		if _, e := SettingRequest(&row.key, row.values); !errors.Is(e, errors.InvalidInput) {
			t.Fatal(e)
		}
	}

	for _, row := range []struct {
		value string
		want  int64
	}{{"1d", 86400000}, {"7d", 604800000}, {"30d", 2592000000}} {
		p, e := UnlockPeriod(row.value)
		if e != nil || *p != row.want {
			t.Fatal(p, e)
		}
	}

	p, e := UnlockPeriod("never")
	if p != nil || e != nil {
		t.Fatal(p, e)
	}
}

func TestPrivacy(t *testing.T) {
	if TelemetryEnabled(false, nil) || !TelemetryEnabled(true, nil) || TelemetryEnabled(true, map[string]string{"DO_NOT_TRACK": "1"}) || TelemetryEnabled(true, map[string]string{"ENVDEN_TELEMETRY": "0"}) || UpdateCheckEnabled(true, map[string]string{"ENVDEN_NO_UPDATE_CHECK": "1"}) || !UpdateCheckEnabled(true, nil) {
		t.Fatal("privacy overrides")
	}
}

func TestUnsupportedEnvFilePatterns(t *testing.T) {
	home := t.TempDir()
	timing := lock.Timing{Now: func() int64 { return 0 }}
	_, err := SetConfig(context.Background(), "env-files", `{"include":[".env*"],"exclude":["apps[/]web/.env"]}`, home, timing, true)
	if !errors.Is(err, errors.InvalidInput) || err.Error() != "Unsupported env file pattern" {
		t.Fatal(err)
	}

	if _, err := os.Stat(Paths(home).Config); !os.IsNotExist(err) {
		t.Fatal("refused config was saved", err)
	}

	if err := os.WriteFile(Paths(home).Config, []byte(`{"env-files":{"include":["apps/{*,**}"]}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := ReadConfig(home); err == nil || err.Error() != "Unsupported env file pattern" {
		t.Fatal(err)
	}

	if err := RefuseConfiguredPatterns(home); err == nil || err.Error() != "Unsupported env file pattern" {
		t.Fatal(err)
	}

	for _, raw := range []string{`{"env-files":{"extraSkipped":["[a"]}}`} {
		if _, err := ParseConfig([]byte(raw)); err != nil {
			t.Fatal(raw, err)
		}
	}

	for _, raw := range []string{`{"unknown":true,"env-files":{"include":["["]}}`, `{"env-files":{"include":["["]},"telemetry":"bad"}`} {
		if _, err := ParseConfig([]byte(raw)); err == nil || err.Error() != "Invalid config" {
			t.Fatal(raw, err)
		}

		if err := os.WriteFile(Paths(home).Config, []byte(raw), 0o600); err != nil {
			t.Fatal(err)
		}

		if err := RefuseConfiguredPatterns(home); err != nil {
			t.Fatal("schema errors surface where the config is read", err)
		}
	}
}
