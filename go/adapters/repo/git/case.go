package git

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
)

func caseProbe(names []string) (string, string, string) {
	for _, name := range names {
		alternate := name
		for i, c := range []byte(name) {
			if c >= 'a' && c <= 'z' {
				alternate = name[:i] + strings.ToUpper(string(c)) + name[i+1:]
				break
			}
			if c >= 'A' && c <= 'Z' {
				alternate = name[:i] + strings.ToLower(string(c)) + name[i+1:]
				break
			}
		}
		if name == alternate {
			continue
		}
		for _, n := range names {
			if n == alternate {
				return "sensitive", "", ""
			}
		}

		return "compare", name, alternate
	}

	return "empty", "", ""
}

func caseInsensitive(root string, readOnly bool) (bool, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return false, err
	}
	names := []string{}
	for _, e := range entries {
		names = append(names, e.Name())
	}
	kind, name, alternate := caseProbe(names)
	if kind == "sensitive" {
		return false, nil
	}
	if kind == "empty" {
		if readOnly {
			return false, errors.New(errors.NotImplemented, "Filesystem case behavior requires a writable probe")
		}
		f, err := os.CreateTemp(root, ".envden-case-*")
		if err != nil {
			return false, err
		}
		_ = f.Close()
		defer func() { _ = os.Remove(f.Name()) }()
		name = filepath.Base(f.Name())
		alternate = strings.ToUpper(name)
	}
	original, err := os.Lstat(filepath.Join(root, name))
	if err != nil {
		return false, err
	}
	other, err := os.Lstat(filepath.Join(root, alternate))
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	return os.SameFile(original, other), nil
}
