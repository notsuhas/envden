package rc

import (
	stderrors "errors"
	"io"
	"os"
	"path/filepath"
	"syscall"

	"github.com/notsuhas/envden/go/core/errors"
)

type editHooks struct{ Resolved, Opened, Read func() error }

func editRC(path string, transform func(string) string, backup string, hooks ...editHooks) error {
	var h editHooks
	if len(hooks) > 0 {
		h = hooks[0]
	}
	resolved := path
	flags := os.O_RDONLY | noFollow
	for hops := 0; hops < 40; hops++ {
		real, err := filepath.EvalSymlinks(resolved)
		if err == nil {
			resolved = real
			break
		}
		if !os.IsNotExist(err) {
			return err
		}
		s, err := os.Lstat(resolved)
		if err == nil && s.Mode()&os.ModeSymlink != 0 {
			target, e := os.Readlink(resolved)
			if e != nil {
				return e
			}
			if !filepath.IsAbs(target) {
				target = filepath.Join(filepath.Dir(resolved), target)
			}
			resolved = target
			continue
		}
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		if transform("") == "" {
			return nil
		}
		if err = os.MkdirAll(filepath.Dir(resolved), 0777); err != nil { //nolint:gosec // G301: shell profile parents are public directories created with the user umask.

			return err
		}
		flags |= os.O_CREATE | os.O_EXCL
		break
	}
	if h.Resolved != nil {
		if err := h.Resolved(); err != nil {
			return err
		}
	}
	f, err := os.OpenFile(resolved, flags, 0600)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	opened, err := f.Stat()
	if err != nil {
		return err
	}
	s, err := os.Lstat(resolved)
	if err != nil {
		return err
	}
	if err = validateRC(resolved, opened); err != nil {
		return err
	}
	if err = validateRC(resolved, s); err != nil {
		return err
	}
	if !os.SameFile(opened, s) {
		return errors.New(errors.Conflict, "Shell configuration changed during editing")
	}
	if err = verifyOwner(resolved); err != nil {
		return err
	}
	if h.Opened != nil {
		if err := h.Opened(); err != nil {
			return err
		}
	}
	b, err := io.ReadAll(f)
	if err != nil {
		return err
	}
	next := transform(string(b))
	if h.Read != nil {
		if err := h.Read(); err != nil {
			return err
		}
	}
	if next == string(b) {
		return nil
	}
	if backup != "" {
		if err = backupRC(backup, b); err != nil {
			return err
		}
	}
	tmp, err := os.OpenFile(filepath.Join(filepath.Dir(resolved), ".envden-rc-"+uuid()), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if err = tmp.Chmod(s.Mode().Perm()); err == nil {
		_, err = tmp.WriteString(next)
	}
	if err == nil {
		err = tmp.Sync()
	}
	closeErr := tmp.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	current, err := os.Lstat(resolved)
	if err != nil {
		return err
	}
	if !sameRC(current, s) {
		return errors.New(errors.Conflict, "Shell configuration changed during editing")
	}

	return replaceRC(tmp.Name(), resolved, s)
}

func replaceRC(temporary, destination string, expected os.FileInfo) error {
	err := os.Rename(temporary, destination)
	if !stderrors.Is(err, syscall.EPERM) {
		return err
	}
	current, e := os.Lstat(destination)
	if e != nil {
		return e
	}
	if !sameRC(current, expected) || current.Mode().Perm()&0200 != 0 {
		return err
	}
	if e = os.Chmod(destination, current.Mode().Perm()|0200); e != nil {
		return e
	}
	if e = os.Rename(temporary, destination); e != nil {
		_ = os.Chmod(destination, current.Mode().Perm())
	}

	return e
}
