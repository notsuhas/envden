package process

import (
	"os"
	"path/filepath"
	"strings"

	enverrors "github.com/notsuhas/envden/go/core/errors"
)

func trustedDirectory(p string) bool {
	if !filepath.IsAbs(p) {
		return false
	}
	real, err := filepath.EvalSymlinks(p)
	if err != nil || InsideWorkingTree(p) || InsideWorkingTree(real) {
		return false
	}
	info, err := os.Stat(real)

	return err == nil && info.IsDir() && trustedInfo(info)
}

func TrustedDirectories(directories []string, managerBin string) []string {
	if directories == nil {
		directories = FixedDirectories("")
	}
	candidates := append(append([]string{}, directories...), managerBin)
	result := []string{}
	seen := map[string]bool{}
	for _, p := range candidates {
		if !seen[p] && trustedDirectory(p) {
			result = append(result, p)
			seen[p] = true
		}
	}

	return result
}

func ResolveTrustedExecutable(name string) (string, error) {
	self, _ := os.Executable()
	if name == "bun" || name == self {
		return self, nil
	}
	candidates := []string{name}
	if !filepath.IsAbs(name) {
		candidates = nil
		if filepath.Base(name) != name {
			return "", enverrors.New(enverrors.InvalidInput, "Trusted executable unavailable")
		}
		for _, dir := range TrustedDirectories(nil, "") {
			candidates = append(candidates, filepath.Join(dir, name))
			if platformName() == "win32" && filepath.Ext(name) == "" {
				candidates = append(candidates, filepath.Join(dir, name+".exe"), filepath.Join(dir, name+".com"))
			}
		}
	}
	for _, p := range candidates {
		real, err := filepath.EvalSymlinks(p)
		if err != nil {
			continue
		}
		info, err := os.Stat(real)
		if err != nil || !info.Mode().IsRegular() || !trustedInfo(info) || !trustedDirectory(filepath.Dir(p)) || !trustedDirectory(filepath.Dir(real)) {
			continue
		}
		if executable(real, info) {
			return real, nil
		}
	}

	return "", enverrors.New(enverrors.InvalidInput, "Trusted executable unavailable")
}

func inheritedEnvironment() map[string]string {
	env := map[string]string{}
	for _, v := range os.Environ() {
		key, value, ok := strings.Cut(v, "=")
		if ok {
			env[key] = value
		}
	}

	return env
}

func TrustedOwnerAndMode(mode uint32, uid, gid uint32, platform string) bool {
	if platform == "win32" {
		return true
	}
	if mode&2 != 0 {
		return false
	}
	if mode&16 != 0 && gid != 0 && (platform != "darwin" || gid != 80) {
		return false
	}

	return uid == 0 || int(uid) == currentUID()
}
