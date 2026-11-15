package rc

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/core/process"
)

func powerShellProfile(run func(string, []string, process.Options) (string, error), home, platform string) string {
	candidates := []string{}
	for _, shell := range []string{"pwsh", "powershell"} {
		path, e := run(shell, []string{"-NoProfile", "-NonInteractive", "-Command", "$PROFILE.CurrentUserCurrentHost"}, process.Options{Timeout: 5000})
		if e != nil {
			continue
		}
		path = strings.TrimSuffix(strings.TrimSuffix(path, "\n"), "\r")
		valid := filepath.IsAbs(path) && filepath.Base(path) == "Microsoft.PowerShell_profile.ps1"
		for _, r := range path {
			if r < 32 || r >= 127 && r <= 159 {
				valid = false
			}
		}
		if valid {
			candidates = append(candidates, path)
		}
	}
	defaults := []string{filepath.Join(home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1")}
	if platform == "windows" {
		defaults = []string{filepath.Join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"), filepath.Join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1")}
	}
	for _, p := range append(append([]string{}, candidates...), defaults...) {
		b, e := os.ReadFile(p)
		if e == nil && strings.Contains(string(b), start) {
			return p
		}
	}
	if len(candidates) > 0 {
		return candidates[0]
	}

	return ""
}
