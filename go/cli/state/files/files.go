package files

import (
	"fmt"
	"github.com/google/uuid"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

var owned = struct {
	sync.RWMutex
	roots map[string]bool
}{roots: map[string]bool{}}

func prepareDirectory(path string) error {
	if err := os.MkdirAll(path, 0700); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New(errors.InvalidInput, "Unsafe state directory")
	}
	return nil
}

func PrivateDirectory(path string) error {
	if err := prepareDirectory(path); err != nil {
		return err
	}
	if err := process.RestrictAccess(path, true); err != nil {
		return err
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	owned.Lock()
	owned.roots[absolute] = true
	owned.Unlock()
	return nil
}

func AtomicWrite(path string, data []byte, now func() int64) error {
	parent := filepath.Dir(path)
	absolute, err := filepath.Abs(parent)
	if err != nil {
		return err
	}
	private := false
	owned.RLock()
	for root := range owned.roots {
		rel, e := filepath.Rel(root, absolute)
		if e == nil && rel != ".." && !filepath.IsAbs(rel) && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			private = true
			break
		}
	}
	owned.RUnlock()
	if private {
		err = PrivateDirectory(parent)
	} else {
		err = prepareDirectory(parent)
	}
	if err != nil {
		return err
	}
	temporary := filepath.Join(parent, fmt.Sprintf(".%013d_%s.tmp", now(), uuid.NewString()))
	defer os.Remove(temporary)
	f, err := os.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	err = process.RestrictAccess(temporary, false)
	if err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Rename(temporary, path); err != nil {
		return err
	}
	if runtime.GOOS != "windows" {
		d, e := os.Open(parent)
		if e != nil {
			return e
		}
		defer d.Close()
		return d.Sync()
	}
	return nil
}

func OptionalRead(path string) (*string, error) {
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New(errors.InvalidData, "Unsafe state file")
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	s := string(data)
	return &s, nil
}
