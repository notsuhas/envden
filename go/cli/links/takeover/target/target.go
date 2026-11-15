package target

import (
	"os"
)

func RegularTarget(path string) bool {
	stat, err := os.Stat(path)

	return err == nil && stat.Mode().IsRegular()
}

func ReadTarget(path string) []byte {
	if !RegularTarget(path) {
		return nil
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	return content
}
