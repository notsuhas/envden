package telemetry

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
)

func TestTelemetryChild(t *testing.T) {
	env := ChildEnvironment("body", map[string]string{"ENVDEN_HOME": "/envden", "HTTP_PROXY": "proxy", "TOKEN": "secret", "PATH": "unsafe"})
	if env[TelemetryBody] != "body" || env["ENVDEN_NO_UPDATE_CHECK"] != "1" || env["HTTP_PROXY"] != "proxy" || env["TOKEN"] != "" || env["PATH"] != "" {
		t.Fatal(env)
	}

	calls := 0
	DeliverTelemetry(context.Background(), "", func(*http.Request) (*http.Response, error) { t.Fatal("empty event sent"); return nil, nil })
	DeliverTelemetry(context.Background(), "{}", func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != "POST" || r.URL.String() != "https://us.i.posthog.com/capture/" {
			t.Fatal(r)
		}

		return nil, fmt.Errorf("offline")
	})
	if calls != 1 {
		t.Fatal(calls)
	}
}

func TestTelemetryPayload(t *testing.T) {
	negative := -1
	raw, e := jsonvalue.Marshal(TelemetryPayload("id", Event{Command: "status", Success: true, Changed: &negative}, "darwin"))
	want := `{"event":"cli_command","properties":{"distinct_id":"id","version":"0.3.8","os":"darwin","command":"status","success":true,"$ip":null,"$geoip_disable":true}}`
	if e != nil || string(raw) != want {
		t.Fatal(string(raw), e)
	}
}
