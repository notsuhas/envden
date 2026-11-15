package cli

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
)

func (k deviceKeychain) Get(name string, required bool) ([]byte, error) {
	if name == "envden/"+k.home+"/device" {
		if _, err := os.Stat(filepath.Join(k.home, "state", "device.json")); err == nil {
			required = true
		}
	}

	return k.Keychain.Get(name, required)
}

func (p preparedPlacement) Place(store, destination string, prepare func(string) error, replacing *string) error {
	if prepare == nil {
		prepare = func(path string) error {
			checkout, err := p.repo.CheckoutAt(p.root)
			if err != nil {
				return err
			}

			if checkout == nil {
				return errors.New(errors.NotFound, "Checkout is unavailable")
			}

			return p.repo.EnsureIgnored(*checkout, path)
		}
	}

	return p.Placement.Place(store, destination, prepare, replacing)
}

func stableExecutable(executable string) string {
	if m := regexp.MustCompile(`^(/.*)/Cellar/envden/`).FindStringSubmatch(executable); len(m) > 1 {
		return m[1] + "/bin/envden"
	}

	for _, prefix := range []string{"/opt/homebrew", "/usr/local"} {
		if executable == prefix+"/bin/envden" || executable == prefix+"/opt/envden/bin/envden" {
			return prefix + "/bin/envden"
		}
	}

	normalized := strings.ReplaceAll(executable, "\\", "/")
	if m := regexp.MustCompile(`(?i)^([a-z]:/.*/scoop/apps/envden/)[^/]+(/.*)$`).FindStringSubmatch(normalized); len(m) > 1 {
		out := m[1] + "current" + m[2]
		if strings.Contains(executable, "\\") {
			out = strings.ReplaceAll(out, "/", "\\")
		}

		return out
	}

	return executable
}
