package process

import (
	"github.com/notsuhas/envden/go/core/paths"
	"os"
	"path/filepath"
	"slices"
	"sync"
)

var rootsMu sync.RWMutex
var untrustedRoots []string

func SetUntrustedRoots(roots []string) {
	rootsMu.Lock()
	defer rootsMu.Unlock()
	untrustedRoots = nil
	for _, r := range roots {
		absolute, err := filepath.Abs(r)
		if err != nil {
			continue
		}
		untrustedRoots = append(untrustedRoots, absolute)
		if canonical, err := filepath.EvalSymlinks(absolute); err == nil {
			untrustedRoots = append(untrustedRoots, canonical)
		}
	}
}
func insideUntrustedRoot(p string) bool {
	rootsMu.RLock()
	defer rootsMu.RUnlock()
	for _, r := range untrustedRoots {
		if paths.PlaceInRoot(r, p) != "outside" {
			return true
		}
	}
	return false
}
func InsideWorkingTree(p string, exceptions ...[]string) bool {
	if insideUntrustedRoot(p) {
		return true
	}
	allowed := ManagerRoots("", "")
	if len(exceptions) > 0 {
		allowed = exceptions[0]
	}
	for {
		if _, err := os.Stat(filepath.Join(p, ".git")); err == nil && !slices.Contains(allowed, p) {
			return true
		}
		parent := filepath.Dir(p)
		if parent == p {
			return false
		}
		p = parent
	}
}
