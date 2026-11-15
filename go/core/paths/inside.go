package paths

import (
	"path"
	"path/filepath"
	"runtime"
	"strings"
)

func PlaceInRoot(root, target string) string {
	if runtime.GOOS == "windows" {
		return PlaceInRootWindows(root, target)
	}
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return "outside"
	}
	if rel == "." {
		return "root"
	}
	if filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "outside"
	}
	return "inside"
}
func PlaceInRootWindows(root, target string) string {
	r := path.Clean(strings.ToLower(strings.ReplaceAll(root, `\`, "/")))
	t := path.Clean(strings.ToLower(strings.ReplaceAll(target, `\`, "/")))
	if r == t {
		return "root"
	}
	if strings.HasPrefix(t, strings.TrimRight(r, "/")+"/") {
		return "inside"
	}
	return "outside"
}
