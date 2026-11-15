package render

import (
	"fmt"
	"strings"

	"github.com/notsuhas/envden/go/cli/diagnostics"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/output"
)

func field(o jsonvalue.Object, k string) any {
	for _, f := range o {
		if f.Key == k {
			return f.Value
		}
	}

	return nil
}

func DoctorText(r diagnostics.Report) string {
	lines := []string{}
	if r.Keys.OwnerOnly {
		lines = append(lines, "✓ Keys: private files in "+r.Keys.Location+" (owner-only, like ~/.ssh)")
	} else {
		lines = append(lines, "✗ Keys: other users can read key files in "+r.Keys.Location+"; run chmod -R go-rwx "+r.Keys.Location)
	}

	if r.Symlinks {
		lines = append(lines, "✓ Symlinks work")
	} else {
		lines = append(lines, "! Symlinks unavailable; checkouts get copies")
	}

	note := ""
	if r.Update.Message != "" {
		note = " (" + r.Update.Message + ")"
	}

	switch {
	case r.Update.Required:
		lines = append(lines, "✗ Update required; run envden update"+note)
	case r.Update.Available:
		lines = append(lines, "! Update available; run envden update"+note)
	case r.Update.Message != "":
		lines = append(lines, "! "+r.Update.Message)
	default:
		lines = append(lines, "✓ envden is up to date")
	}

	network := r.Tailscale
	if field(network, "ready") == true {
		text := "✓ Tailscale: connected"
		if host, ok := field(network, "hostname").(string); ok && host != "" {
			text += " as " + host
		}

		lines = append(lines, text)
	} else {
		problem := "not ready"
		if field(network, "running") != true {
			problem = "not running"
		} else if field(network, "loggedIn") != true {
			problem = "not logged in"
		}

		if p, ok := field(network, "problem").(jsonvalue.Object); ok {
			problem = fmt.Sprint(field(p, "message"))
		}

		lines = append(lines, "✗ Tailscale: "+problem)
	}

	if field(r.HTTPS, "kind") == "ready" {
		lines = append(lines, "✓ HTTPS certificates enabled")
	} else {
		lines = append(lines, "✗ HTTPS certificates: "+fmt.Sprint(field(r.HTTPS, "message")))
	}

	installed := false
	for _, s := range r.Shells {
		if s.Installed {
			installed = true
			lines = append(lines, "✓ Shell notice: "+s.Shell+" ("+s.Path+")")
		}
	}

	if !installed {
		lines = append(lines, "! Shell notice: not installed; run envden shell install")
	}

	return output.SanitizeConsole(strings.Join(lines, "\n"))
}
