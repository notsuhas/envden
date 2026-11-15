package telemetry

import (
	"context"
	"crypto/rand"
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	"path/filepath"
	"runtime"
	"strings"
)

type Event struct {
	Command            string
	Success            bool
	ErrorCode          errors.Code
	Changed, Conflicts *int
}

func TelemetryPayload(id string, event Event, platform string) jsonvalue.Object {
	p := jsonvalue.Object{{Key: "distinct_id", Value: id}, {Key: "version", Value: version.Version}, {Key: "os", Value: platform}, {Key: "command", Value: event.Command}, {Key: "success", Value: event.Success}}
	if validCode(event.ErrorCode) {
		p.Set("error_code", event.ErrorCode)
	}
	if event.Changed != nil && *event.Changed >= 0 && int64(*event.Changed) <= 9007199254740991 {
		p.Set("changed", *event.Changed)
	}
	if event.Conflicts != nil && *event.Conflicts >= 0 && int64(*event.Conflicts) <= 9007199254740991 {
		p.Set("conflicts", *event.Conflicts)
	}
	p.Set("$ip", nil)
	p.Set("$geoip_disable", true)
	return jsonvalue.Object{{Key: "event", Value: "cli_command"}, {Key: "properties", Value: p}}
}
func validCode(code errors.Code) bool {
	for _, c := range strings.Fields("INVALID_INPUT INVALID_DATA UNAUTHORIZED LOCKED RATE_LIMITED UPDATE_REQUIRED CLIENT_TOO_OLD NOT_FOUND STORAGE_QUOTA SERVER_UNREACHABLE CONFLICT INTERNAL NOT_IMPLEMENTED HEAD_MOVED BUSY ROLLBACK FORK NOT_MEMBER RECOVERY_KIT_REQUIRED SERVER_TOO_OLD MOVING RESTORED_MODE") {
		if string(code) == c {
			return true
		}
	}
	return false
}
func ReportTelemetry(ctx context.Context, a contracts.Adapters, event Event, env map[string]string, send func(string)) {
	if settings.TelemetryKey == "" {
		return
	}
	config, e := settings.ReadConfig(a.Home)
	if e != nil || !settings.TelemetryEnabled(config.Telemetry, env) {
		return
	}
	var id string
	e = lock.WithStateLock(ctx, a.Home, a.Timing, func(context.Context) error {
		path := filepath.Join(a.Home, "state", "install-id")
		saved, e := files.OptionalRead(path)
		if e != nil {
			return e
		}
		if saved != nil && *saved != "" {
			id = *saved
			return nil
		}
		raw := make([]byte, 16)
		if _, e = rand.Read(raw); e != nil {
			return e
		}
		raw[6] = (raw[6] & 15) | 64
		raw[8] = (raw[8] & 63) | 128
		id = fmt.Sprintf("%x-%x-%x-%x-%x", raw[:4], raw[4:6], raw[6:8], raw[8:10], raw[10:])
		return files.AtomicWrite(path, []byte(id), a.Now)
	})
	if e != nil {
		return
	}
	platform := runtime.GOOS
	if platform == "windows" {
		platform = "win32"
	}
	body := jsonvalue.Object{{Key: "api_key", Value: settings.TelemetryKey}}
	for _, f := range TelemetryPayload(id, event, platform) {
		body.Set(f.Key, f.Value)
	}
	raw, e := jsonvalue.Marshal(body)
	if e == nil {
		send(string(raw))
	}
}
func CommandOutcome(action func() error, report func(Event)) error {
	e := action()
	event := Event{Success: e == nil}
	if e != nil {
		event.ErrorCode = errors.Internal
		if cause, ok := errors.As(e); ok {
			event.ErrorCode = cause.Code
		}
	}
	report(event)
	return e
}
