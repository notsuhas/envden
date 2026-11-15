package updates

import (
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/errors"
	"os"
)

func ReplaceBinary(path string, bytes []byte, windows bool, verify func(string) error, after func() error, now func() int64) error {
	stat, e := os.Lstat(path)
	if e != nil {
		return e
	}
	if !stat.Mode().IsRegular() || stat.Mode()&os.ModeSymlink != 0 {
		return errors.New(errors.InvalidInput, "Unsafe binary destination")
	}
	temporary := path + ".envden-new"
	if windows {
		temporary += ".exe"
	}
	if e = files.AtomicWrite(temporary, bytes, now); e != nil {
		return e
	}
	if e = os.Chmod(temporary, 0755); e != nil {
		return e
	}
	if e = verify(temporary); e != nil {
		os.Remove(temporary)
		return errors.Wrap(errors.InvalidData, "Release binary verification failed", e)
	}
	old := path + ".envden-old"
	backedUp := false
	if windows {
		e = os.Rename(path, old)
	} else {
		var raw []byte
		raw, e = os.ReadFile(path)
		if e == nil {
			e = os.WriteFile(old, raw, stat.Mode().Perm())
		}
	}
	if e == nil {
		backedUp = true
		e = os.Rename(temporary, path)
	}
	if e == nil {
		e = after()
	}
	if e == nil && !windows {
		e = os.Remove(old)
	}
	if e != nil {
		if backedUp {
			if windows {
				os.Remove(path)
			}
			os.Rename(old, path)
		}
		os.Remove(temporary)
	}
	return e
}
func CleanupOldBinary(path string, windows bool) error {
	if !windows {
		return nil
	}
	e := os.Remove(path + ".envden-old")
	if os.IsNotExist(e) {
		return nil
	}
	return e
}
