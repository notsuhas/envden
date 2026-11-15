package telemetry

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/process"
	"net/http"
	"os"
	"strings"
	"time"
)

const TelemetryBody = "ENVDEN_TELEMETRY_BODY"
const TelemetrySendCommand = "telemetry-send"

func ChildEnvironment(body string, inherited map[string]string) map[string]string {
	env := map[string]string{TelemetryBody: body, "ENVDEN_NO_UPDATE_CHECK": "1"}
	names := []string{"ENVDEN_HOME"}
	for _, key := range []string{"HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"} {
		names = append(names, key, strings.ToLower(key))
	}
	for _, key := range names {
		if inherited[key] != "" {
			env[key] = inherited[key]
		}
	}
	return env
}
func DeliverTelemetry(ctx context.Context, body string, fetch client.Fetch) {
	if body == "" {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	r, e := http.NewRequestWithContext(ctx, "POST", "https://us.i.posthog.com/capture/", strings.NewReader(body))
	if e != nil {
		return
	}
	r.Header.Set("Content-Type", "application/json")
	response, e := fetch(r)
	if e == nil {
		response.Body.Close()
	}
}
func SendInBackground(binary, body string, env map[string]string) {
	child, e := process.SpawnTrusted(binary, []string{TelemetrySendCommand}, process.Options{Env: ChildEnvironment(body, env), Stdout: "ignore", Stderr: "ignore"})
	if e == nil {
		_ = child.Cmd.Process.Release()
	}
}
func SystemEnvironment() map[string]string {
	env := map[string]string{}
	for _, entry := range os.Environ() {
		k, v, _ := strings.Cut(entry, "=")
		env[k] = v
	}
	return env
}
