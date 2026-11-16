package list

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/x/ansi"
	"github.com/notsuhas/envden/go/cli/output"
	clitime "github.com/notsuhas/envden/go/cli/time"
)

func ChangesText(changes any) string {
	if s, ok := changes.(string); ok {
		if s == "unknown" {
			return "changes unknown"
		}

		return "changed (file not parsable)"
	}

	c := changes.(KeyChanges)
	parts := []string{}
	if len(c.Added) > 0 {
		parts = append(parts, "added "+strings.Join(c.Added, ", "))
	}

	if len(c.Changed) > 0 {
		parts = append(parts, "changed "+strings.Join(c.Changed, ", "))
	}

	if len(c.Removed) > 0 {
		parts = append(parts, "removed "+strings.Join(c.Removed, ", "))
	}

	if len(parts) == 0 {
		return "no key changes"
	}

	return strings.Join(parts, "; ")
}

func HistoryText(result Result, now int64, zone string) string {
	if len(result.Files) == 0 {
		return "No env files to show"
	}

	blocks := []string{}
	for _, file := range result.Files {
		lines := []string{file.RepoID + " " + file.Path}
		single := len(file.Checkouts) == 1
		for _, v := range file.Versions {
			when := "unknown time"
			if t, e := time.Parse(time.RFC3339Nano, v.Time); e == nil {
				when, _ = clitime.WhenText(t.UnixMilli(), now, zone)
			}

			device := v.Device
			if device == "" {
				device = "unknown device"
				if v.RemovedDevice {
					device = "removed device"
				}
			}

			change := ChangesText(v.Changes)
			switch v.Kind {
			case "deleted":
				change = "deleted"
			case "lost":
				change = "lost in a server repair"
			case "restored":
				change = "restored by a server repair; " + change
			}

			parts := []string{fmt.Sprintf("  v%d", v.Version), column(when, 42), column(device, 16), change}
			for _, c := range file.Checkouts {
				if c.Version != nil && *c.Version == v.Version {
					mark := "<- current"
					if !single {
						mark += " in " + c.Root
					}

					parts = append(parts, mark)
				}
			}

			lines = append(lines, strings.Join(parts, "  "))
		}

		if len(file.Versions) == 0 {
			lines = append(lines, "  no retained versions")
		}

		if file.Pruned {
			lines = append(lines, "  older versions pruned")
		}

		for _, c := range file.Checkouts {
			if c.Version == nil {
				root := c.Root
				if single {
					root = "This checkout"
				}

				lines = append(lines, "  "+root+" matches no retained version")
			}
		}

		blocks = append(blocks, strings.Join(lines, "\n"))
	}

	return output.SanitizeConsole(strings.Join(blocks, "\n\n"))
}

func column(s string, width int) string { return s + strings.Repeat(" ", max(0, width-stringWidth(s))) }

func stringWidth(s string) int { return ansi.StringWidth(s) }
