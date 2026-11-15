package status

import (
	"fmt"
	"html"
	"strings"
	"time"

	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	libdatefns "github.com/notsuhas/envden/go/lib/datefns"
	libprettybytes "github.com/notsuhas/envden/go/lib/prettybytes"
)

const style = `body{margin:0;min-height:100vh;display:grid;place-items:center;background:rgba(12,12,11,1);color:rgba(237,233,224,1);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
main{width:min(30rem,calc(100vw - 2rem));padding:1.75rem;background:rgba(19,19,17,1);border:1px solid rgba(237,233,224,0.12);border-radius:12px}
h1{margin:0 0 1.25rem;font-size:1.25rem;font-weight:450;letter-spacing:-0.025em}
h1 span{color:rgba(247,190,84,1)}
dl{display:grid;grid-template-columns:auto 1fr;gap:.5rem 1.5rem;margin:0}
dt{color:rgba(160,157,148,1);font:12px/1.9 ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;letter-spacing:.06em}
dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.alarm{color:rgba(235,104,65,1)}
p{margin:1.25rem 0 0;padding-top:1rem;border-top:1px solid rgba(237,233,224,0.12);color:rgba(160,157,148,1);font-size:13px}
code{font-family:ui-monospace,SFMono-Regular,monospace;color:rgba(237,233,224,1)}`

const page = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>envden server</title>
        %s
      </head>
      <body>
        <main>
          <h1><span>envden</span> server</h1>
          <dl>%s</dl>
          <p>Per-vault details are only in <code>envden ui</code> on a member device.</p>
        </main>
      </body>
    </html> `

func FormatUptime(seconds int64) string {
	text := libdatefns.FormatDuration(libdatefns.IntervalToDuration(time.Unix(0, 0).UTC(), time.Unix(seconds, 0).UTC()), "days", "hours", "minutes")
	if text == "" {
		return "under a minute"
	}

	return text
}

func FormatWhen(utc string, now int64) string {
	date, _ := time.Parse(time.RFC3339Nano, utc)

	return libdatefns.FormatDistanceStrict(date, time.UnixMilli(now), libdatefns.DistanceOptions{AddSuffix: true}) + " (" + libdatefns.Format(date.UTC(), "yyyy-MM-dd HH:mm") + " UTC)"
}

func Render(value wire.StatusResponse, now int64) string {
	row := func(label, value string, alarm bool) string {
		class := ""
		if alarm {
			class = ` class="alarm"`
		}

		return "<dt>" + html.EscapeString(label) + "</dt><dd" + class + ">" + html.EscapeString(value) + "</dd>"
	}
	modes := map[string]string{"normal": "Normal", "restored": "Restored from backup, accepting repairs only", "moved": "Moved to another server, read-only"}
	rows := []string{row("Version", value.Version, false), row("Uptime", FormatUptime(value.UptimeSeconds), false), row("Mode", modes[value.Mode], value.Mode != "normal"), row("Vaults", fmt.Sprint(value.Vaults), false), row("Storage", libprettybytes.Format(float64(value.StorageBytes), libprettybytes.Options{Binary: true}), false)}
	bands := map[string]string{"below-50": "under 50% of quota", "50-80": "50–80% of quota", "80-95": "80–95% of quota", "95-plus": "95% of quota or more"}
	if value.FullestVault != nil {
		rows = append(rows, row("Fullest vault", bands[*value.FullestVault], *value.FullestVault == "95-plus"))
	}
	prune := "not yet"
	alarm := false
	if value.LastPrune != nil {
		result := "succeeded"
		if !value.LastPrune.OK {
			result = "failed"
			alarm = true
		}
		prune = FormatWhen(value.LastPrune.At, now) + ", " + result
	}
	rows = append(rows, row("Last prune", prune, alarm))

	return fmt.Sprintf(page, "<style>"+style+"</style>", strings.Join(rows, ""))
}
