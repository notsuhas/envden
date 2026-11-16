package store

import "path/filepath"

// An empty ENVDEN_HOME counts as unset, so state never lands in the working directory.
func EnvdenHome(override, userHome string) string {
	if override != "" {
		return override
	}

	return filepath.Join(userHome, ".envden")
}
