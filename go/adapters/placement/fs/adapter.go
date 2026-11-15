//go:build !windows

package fs

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
)

func (p *placement) Place(store, dest string, prepare func(string) error, replacing *string) (err error) {
	defer failure(&err)
	path, err := relative(p.root, dest, true)
	if err != nil {
		return err
	}
	temp := fmt.Sprintf(".envden-%x", sha256.Sum256([]byte(path)))
	if p.mode == adapters.PlacementCopy {
		if prepare == nil {
			return e.New("INVALID_INPUT", "Copy placement requires a temporary file exclude")
		}
		if err = prepare(filepath.ToSlash(filepath.Join(filepath.Dir(path), temp))); err != nil {
			return err
		}
	}
	fd, err := openParent(p.root, path, true)
	if err != nil {
		return err
	}
	defer unix.Close(fd)
	name := filepath.Base(path)
	before, err := identity(fd, name)
	if err != nil {
		return err
	}
	var previous []byte
	if before != nil {
		target, linked := linkTarget(fd, name)
		if linked {
			if (replacing == nil || target != *replacing) && !sameTarget(resolveLink(filepath.Join(p.root, filepath.Dir(path)), target), store) {
				return e.New("INVALID_INPUT", "Refusing an unrelated symlink")
			}
		} else {
			previous, err = readAt(fd, name)
			if err != nil {
				return err
			}
		}
	}
	contents, err := readStore(store)
	if err != nil {
		return err
	}
	current, err := identity(fd, temp)
	if err != nil {
		return err
	}
	if current != nil {
		if err = unix.Unlinkat(fd, temp, 0); err != nil {
			return descriptor(err)
		}
	}
	if p.mode == adapters.PlacementLink {
		abs, _ := filepath.Abs(store)
		err = unix.Symlinkat(abs, fd, temp)
	} else {
		err = writeAt(fd, temp, contents)
	}
	if err != nil {
		return descriptor(err)
	}
	staged, err := identity(fd, temp)
	if err != nil {
		return err
	}
	defer func() {
		left, _ := identity(fd, temp)
		if sameIdentity(left, staged) {
			_ = unix.Unlinkat(fd, temp, 0)
		}
	}()
	if err = assertIdentity(fd, name, before); err != nil {
		return err
	}
	if previous != nil && !bytes.Equal(previous, contents) {
		if err = p.backup(previous); err != nil {
			return err
		}
	}
	if err = assertIdentity(fd, name, before); err != nil {
		return err
	}
	if err = assertIdentity(fd, temp, staged); err != nil {
		return err
	}
	return descriptor(unix.Renameat(fd, temp, fd, name))
}

func (p *placement) Remove(store *string, dest string) (err error) {
	defer failure(&err)
	path, err := relative(p.root, dest, false)
	if err != nil {
		return err
	}
	if _, err = os.Lstat(p.root); os.IsNotExist(err) {
		return nil
	}
	fd, err := openParent(p.root, path, false)
	if e.Is(err, "NOT_FOUND") {
		return nil
	}
	if err != nil {
		return err
	}
	defer unix.Close(fd)
	name := filepath.Base(path)
	before, err := identity(fd, name)
	if err != nil || before == nil {
		return err
	}
	target, linked := linkTarget(fd, name)
	if linked {
		if store == nil || !sameTarget(resolveLink(filepath.Join(p.root, filepath.Dir(path)), target), *store) {
			return e.New("INVALID_INPUT", "Refusing an unrelated symlink")
		}
	} else {
		if _, err = readAt(fd, name); err != nil {
			return err
		}
	}
	if err = assertIdentity(fd, name, before); err != nil {
		return err
	}
	return descriptor(unix.Unlinkat(fd, name, 0))
}
