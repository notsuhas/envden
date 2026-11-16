package placement

import (
	"path/filepath"
	"strings"
)

func CheckoutPath(cwd, root, path string) string {
	absolute := filepath.Join(root, path)

	if cwd == "" {
		return absolute
	}

	nearby, err := filepath.Rel(cwd, absolute)
	if err == nil && nearby != "." && !filepath.IsAbs(nearby) && strings.Split(nearby, string(filepath.Separator))[0] != ".." {
		return nearby
	}

	return absolute
}
