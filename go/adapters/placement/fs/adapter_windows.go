package fs

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	"os"
	"path/filepath"
)

func (p *placement) Place(store, dest string, prepare func(string) error, replacing *string) (err error) {
	defer failure(&err)
	path, err := relative(p.root, dest, true)
	if err != nil {
		return err
	}
	tempName := fmt.Sprintf(".envden-%x", sha256.Sum256([]byte(path)))
	if p.mode == adapters.PlacementCopy {
		if prepare == nil {
			return e.New("INVALID_INPUT", "Copy placement requires a temporary file exclude")
		}
		if err = prepare(filepath.ToSlash(filepath.Join(filepath.Dir(path), tempName))); err != nil {
			return err
		}
	}
	infos, names, err := parents(p.root, path, true)
	if err != nil {
		return err
	}
	before, err := lstat(dest)
	if err != nil {
		return err
	}
	linked := before != nil && before.Mode()&os.ModeSymlink != 0
	if linked {
		target, err := os.Readlink(dest)
		if err != nil {
			return err
		}
		if !sameTarget(resolveLink(filepath.Dir(dest), target), store) && (replacing == nil || *replacing != target) {
			return e.New("INVALID_INPUT", "Refusing an unrelated symlink")
		}
	} else if before != nil && !before.Mode().IsRegular() {
		return e.New("INVALID_INPUT", "Destination is not a file")
	}
	st, err := os.Lstat(store)
	if err != nil {
		return err
	}
	if !st.Mode().IsRegular() {
		return e.New("INVALID_INPUT", "Store source is not a regular file")
	}
	if err = process.RestrictAccess(store, false); err != nil {
		return err
	}
	contents, err := os.ReadFile(store)
	if err != nil {
		return err
	}
	temp := filepath.Join(filepath.Dir(dest), tempName)
	if err = os.Remove(temp); err != nil && !os.IsNotExist(err) {
		return err
	}
	if p.mode == adapters.PlacementLink {
		abs, _ := filepath.Abs(store)
		err = os.Symlink(abs, temp)
	} else {
		var f *os.File
		f, err = os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err == nil {
			_, err = f.Write(contents)
			closeErr := f.Close()
			if err == nil {
				err = closeErr
			}
		}
		if err == nil {
			err = process.RestrictAccess(temp, false)
		}
	}
	if err != nil {
		return err
	}
	staged, err := os.Lstat(temp)
	if err != nil {
		return err
	}
	defer func() {
		left, _ := lstat(temp)
		if left != nil && os.SameFile(left, staged) {
			os.Remove(temp)
		}
	}()
	if err = verifyParents(infos, names); err != nil {
		return err
	}
	if before != nil && !linked {
		source, err := os.Open(dest)
		if err != nil {
			return err
		}
		opened, err := source.Stat()
		source.Close()
		if err != nil {
			return err
		}
		if !sameFile(before, opened) {
			return e.New("CONFLICT", "Destination changed before backup")
		}
		previous, err := os.ReadFile(dest)
		if err != nil {
			return err
		}
		if !bytes.Equal(previous, contents) {
			if err = p.backup(previous); err != nil {
				return err
			}
		}
	}
	if err = verifyParents(infos, names); err != nil {
		return err
	}
	current, err := lstat(dest)
	if err != nil {
		return err
	}
	if !sameFile(before, current) {
		return e.New("CONFLICT", "Destination changed during placement")
	}
	current, err = os.Lstat(temp)
	if err != nil {
		return err
	}
	if !os.SameFile(staged, current) {
		return e.New("CONFLICT", "Staged file changed")
	}
	return os.Rename(temp, dest)
}

func (p *placement) Remove(store *string, dest string) (err error) {
	defer failure(&err)
	path, err := relative(p.root, dest, false)
	if err != nil {
		return err
	}
	infos, names, err := parents(p.root, path, false)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	st, err := lstat(dest)
	if err != nil || st == nil {
		return err
	}
	if st.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(dest)
		if err != nil {
			return err
		}
		if store == nil || !sameTarget(resolveLink(filepath.Dir(dest), target), *store) {
			return e.New("INVALID_INPUT", "Refusing an unrelated symlink")
		}
	} else if !st.Mode().IsRegular() {
		return e.New("INVALID_INPUT", "Destination is not a file")
	}
	if err = verifyParents(infos, names); err != nil {
		return err
	}
	return os.Remove(dest)
}
