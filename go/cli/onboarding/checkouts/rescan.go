package checkouts

import (
	"github.com/notsuhas/envden/go/cli/output"
	"path/filepath"
	"regexp"
	"strings"
)

var safePath = regexp.MustCompile(`^[\w@%+=:,./-]+$`)

func shellPath(path, home string) string {
	path, _ = filepath.Abs(path)
	rest, err := filepath.Rel(home, path)
	quote := func(value string) string {
		if safePath.MatchString(value) {
			return value
		}
		return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
	}
	if err == nil && rest == "." {
		return "~"
	}
	if err == nil && !strings.HasPrefix(rest, "..") {
		return "~/" + quote(filepath.ToSlash(rest))
	}
	return quote(path)
}

func RescanCommand(command string, roots, excluded []string, home string) string {
	shown := func(paths []string) string {
		items := []string{}
		for _, path := range paths {
			items = append(items, shellPath(path, home))
		}
		return strings.Join(items, " ")
	}
	if command != "setup" {
		if roots == nil {
			roots = []string{home}
		}
		return output.SanitizeTerminal("envden track " + shown(roots))
	}
	parts := []string{"envden setup"}
	if roots != nil {
		parts = append(parts, "--scan-root "+shown(roots))
	}
	if excluded != nil {
		parts = append(parts, "--exclude-root "+shown(excluded))
	}
	return output.SanitizeTerminal(strings.Join(parts, " "))
}
