package diff

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/status"
	"path/filepath"
	"strings"
)

type Place struct{ Cwd, UserHome string }

func StatusText(r status.Report, p Place) string {
	lines := []string{state.NotSetUp}
	if r.Configured {
		lines = configuredLines(r, p)
	}
	if r.Update.Message != "" {
		lines = append(lines, r.Update.Message)
	}
	return output.SanitizeConsole(strings.Join(lines, "\n"))
}
func displayPath(path string, p Place) string {
	relative, e := filepath.Rel(p.Cwd, path)
	if e == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative) {
		if relative == "." {
			return ""
		}
		return relative
	}
	return output.HomePath(path, p.UserHome)
}
func configuredLines(r status.Report, p Place) []string {
	tracked := []status.File{}
	for _, f := range r.Files {
		if f.State != "local-only" {
			tracked = append(tracked, f)
		}
	}
	pending := []string{}
	for _, g := range []struct{ states, label string }{{"changed diverged", "Changed here (run envden push)"}, {"remote diverged", "Newer on server (run envden pull)"}, {"conflict", "Conflicts (run envden resolve --list)"}, {"detached", "Detached (run envden pull)"}, {"missing", "Missing here (run envden pull)"}} {
		names := []string{}
		for _, f := range tracked {
			if strings.Contains(" "+g.states+" ", " "+f.State+" ") {
				names = append(names, displayPath(filepath.Join(f.Root, f.Path), p))
			}
		}
		if len(names) > 0 {
			pending = append(pending, g.label+": "+strings.Join(names, ", "))
		}
	}
	for _, f := range tracked {
		if f.State == "held-back" {
			reason := f.Reason
			if reason == "" {
				reason = "run envden doctor"
			}
			pending = append(pending, "Held back: "+displayPath(filepath.Join(f.Root, f.Path), p)+": "+reason)
		}
	}
	checked := r.ServerChecked != nil && *r.ServerChecked
	if len(pending) == 0 && r.Server == "reachable" && checked {
		if len(tracked) == 0 {
			return []string{"Nothing tracked yet. Run envden track in a checkout."}
		}
		repos := map[string]bool{}
		for _, f := range tracked {
			key := f.RepoID
			if key == "" {
				key = f.Root
			}
			repos[key] = true
		}
		return []string{"In sync: " + plural(len(repos), "repo") + ", " + plural(len(tracked), "env file") + ". Server reachable."}
	}
	server := "Server: " + r.Server + " (" + r.ServerReason + ")"
	if r.Server == "reachable" {
		server = "Server: reachable"
		if !checked {
			server += ", but couldn't check it for newer changes"
		}
	}
	if len(pending) == 0 {
		pending = append(pending, "No changes here")
	}
	return append([]string{server}, pending...)
}
func plural(n int, noun string) string {
	if n != 1 {
		noun += "s"
	}
	return fmt.Sprintf("%d %s", n, noun)
}
