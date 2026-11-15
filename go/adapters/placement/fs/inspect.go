package fs

import (
	"bytes"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"strings"
)

func (p *placement) Inspect(store, dest string) (state adapters.PlacementState, err error) {
	defer failure(&err)
	path, err := relative(p.root, dest, false)
	if err != nil {
		return "", err
	}
	root, err := os.Lstat(p.root)
	if err != nil {
		return "", err
	}
	if !root.IsDir() || root.Mode()&os.ModeSymlink != 0 {
		return "", e.New("INVALID_INPUT", "Unsafe checkout root")
	}
	parent := p.root
	parts := strings.Split(path, "/")
	for _, part := range parts[:len(parts)-1] {
		parent = filepath.Join(parent, part)
		info, err := os.Lstat(parent)
		if os.IsNotExist(err) {
			return adapters.PlacementMissing, nil
		}
		if err != nil {
			return "", err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return "", e.New("INVALID_INPUT", "Unsafe checkout parent")
		}
	}
	info, err := os.Lstat(dest)
	if os.IsNotExist(err) {
		return adapters.PlacementMissing, nil
	}
	if err != nil {
		return "", err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(dest)
		if err != nil {
			return "", err
		}
		if sameTarget(resolveLink(filepath.Dir(dest), target), store) {
			return adapters.PlacementLinked, nil
		}
		return adapters.PlacementDetached, nil
	}
	if !info.Mode().IsRegular() {
		return adapters.PlacementDetached, nil
	}
	if _, err = os.Lstat(store); os.IsNotExist(err) {
		return adapters.PlacementDetached, nil
	} else if err != nil {
		return "", err
	}
	a, err := os.ReadFile(dest)
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(store)
	if err != nil {
		return "", err
	}
	if !bytes.Equal(a, b) {
		return adapters.PlacementDetached, nil
	}
	if p.mode == adapters.PlacementLink {
		return adapters.PlacementRelinkable, nil
	}
	return adapters.PlacementLinked, nil
}
