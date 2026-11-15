package render

import (
	"fmt"
	"strings"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/settings"
)

func ConfigText(c settings.Config, env map[string]string) string {
	lines := []string{}
	for _, k := range []string{"telemetry", "update-check", "agent-merge", "auto-approve-worktrees", "placement", "env-files"} {
		lines = append(lines, SettingText(k, c, env))
	}

	return strings.Join(lines, "\n")
}

func toggle(k string, configured, effective bool) string {
	val := "off"
	if effective {
		val = "on"
	}

	text := k + ": " + val
	if configured != effective {
		set := "off"
		if configured {
			set = "on"
		}

		text += " (set to " + set + "; the environment overrides it)"
	}

	return text
}

func SettingText(k string, c settings.Config, env map[string]string) string {
	switch k {
	case "telemetry":
		return toggle(k, c.Telemetry, settings.TelemetryEnabled(c.Telemetry, env))
	case "update-check":
		return toggle(k, c.UpdateCheck, settings.UpdateCheckEnabled(c.UpdateCheck, env))
	case "agent-merge":
		return toggle(k, c.AgentMerge, c.AgentMerge)
	case "auto-approve-worktrees":
		return toggle(k, c.AutoApproveWorktrees, c.AutoApproveWorktrees)
	}

	var fields *jsonvalue.Object
	if k == "placement" {
		fields = c.Placement
	} else {
		fields = c.EnvFiles
	}

	if fields == nil || len(*fields) == 0 {
		return k + ": default"
	}

	lines := []string{k + ":"}
	for _, f := range *fields {
		value := fmt.Sprint(f.Value)
		if items, ok := f.Value.([]any); ok {
			parts := []string{}
			for _, v := range items {
				parts = append(parts, fmt.Sprint(v))
			}

			value = strings.Join(parts, ", ")
		}

		lines = append(lines, "  "+f.Key+": "+value)
	}

	return output.SanitizeConsole(strings.Join(lines, "\n"))
}

func UnlockPeriodText(period *int64) string {
	if period == nil {
		return "unlock-period: never"
	}

	return fmt.Sprintf("unlock-period: %dd", *period/86400000)
}
