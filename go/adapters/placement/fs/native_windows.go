package fs

import (
	"os"
	"path/filepath"
	"strings"

	enverrors "github.com/notsuhas/envden/go/core/errors"
)

func lstat(path string) (os.FileInfo, error) {
	st, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil, nil
	}

	return st, err
}

func parents(root, path string, create bool) ([]os.FileInfo, []string, error) {
	parts := strings.Split(filepath.ToSlash(filepath.Dir(path)), "/")
	current := root
	infos := []os.FileInfo{}
	names := []string{}
	for _, part := range append([]string{""}, parts...) {
		if part == "." {
			continue
		}
		current = filepath.Join(current, part)
		st, err := lstat(current)
		if err != nil {
			return nil, nil, err
		}
		if st == nil && create && part != "" {
			if err = os.Mkdir(current, 0700); err != nil && !os.IsExist(err) {
				return nil, nil, err
			}
			st, err = os.Lstat(current)
			if err != nil {
				return nil, nil, err
			}
		}
		if st == nil {
			return nil, nil, os.ErrNotExist
		}
		if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			if create {
				if part == "" {
					return nil, nil, enverrors.New("INVALID_INPUT", "Unsafe checkout root")
				}

				return nil, nil, enverrors.New("INVALID_INPUT", "Unsafe checkout parent")
			}

			return nil, nil, enverrors.New("CONFLICT", "Unsafe checkout parent")
		}
		infos = append(infos, st)
		names = append(names, current)
	}

	return infos, names, nil
}

func verifyParents(infos []os.FileInfo, names []string) error {
	for i, name := range names {
		st, err := os.Lstat(name)
		if err != nil {
			return err
		}
		if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 || !os.SameFile(st, infos[i]) {
			return enverrors.New("CONFLICT", "Checkout parent changed")
		}
	}

	return nil
}

func sameFile(a, b os.FileInfo) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}

	return os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime() == b.ModTime()
}
