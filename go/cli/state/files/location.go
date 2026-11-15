package files

import (
	"os"
	"path/filepath"
)

func RealLocation(path string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}

	resolved, err := filepath.EvalSymlinks(absolute)
	if err == nil {
		return resolved, nil
	}

	if !os.IsNotExist(err) {
		return "", err
	}

	parent := filepath.Dir(absolute)
	if parent == absolute {
		return absolute, nil
	}

	resolved, err = RealLocation(parent)
	if err != nil {
		return "", err
	}

	return filepath.Join(resolved, filepath.Base(absolute)), nil
}
