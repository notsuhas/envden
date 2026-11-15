package output

import (
	"path/filepath"
	"strings"
)

func HomePath(path, home string) string {
	if path == home {
		return "~"
	}
	if strings.HasPrefix(path, home+string(filepath.Separator)) {
		return "~" + strings.TrimPrefix(path, home)
	}
	return path
}
func RealHome(home string) string {
	resolved, e := filepath.EvalSymlinks(home)
	if e == nil {
		return resolved
	}
	return home
}
