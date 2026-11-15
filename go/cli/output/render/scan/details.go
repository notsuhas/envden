package scan

import (
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/output"
)

func RepoSkipLine(path, reason, userHome string) string {
	return output.SanitizeTerminal(output.HomePath(path, userHome) + ": skipped: " + reason)
}

func OwnLinkLine(root, path, link, userHome string) string {
	return "envden: skipped " + output.SanitizeTerminal(output.HomePath(filepath.Join(root, path), userHome)) + ": it links to " + output.SanitizeTerminal(link) + ", and envden only syncs files it owns"
}
