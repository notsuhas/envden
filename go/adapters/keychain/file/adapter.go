package file

import (
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
)

type Options struct{ Home string }

type adapter struct{ directory string }

func CreateFileKeychainAdapter(options Options) adapters.Keychain {
	return &adapter{filepath.Join(options.Home, "state", "keys")}
}

func (a *adapter) ID() string { return "file" }

func failure(err error) error {
	if err == nil {
		return nil
	}
	if _, ok := errors.As(err); ok {
		return err
	}

	return errors.Wrap(errors.Locked, "Key storage operation failed", err)
}

func (a *adapter) path(name string) string {
	return filepath.Join(a.directory, fmt.Sprintf("%x.key", sha256.Sum256([]byte(name))))
}

func (a *adapter) OwnerOnly() (bool, error) {
	if runtime.GOOS == "windows" {
		return true, nil
	}
	entries, err := os.ReadDir(a.directory)
	if os.IsNotExist(err) {
		return true, nil
	}
	if err != nil {
		return false, failure(err)
	}
	paths := []string{a.directory}
	for _, e := range entries {
		paths = append(paths, filepath.Join(a.directory, e.Name()))
	}
	for _, p := range paths {
		s, e := os.Stat(p)
		if e != nil {
			return false, failure(e)
		}
		if s.Mode().Perm()&0077 != 0 {
			return false, nil
		}
	}

	return true, nil
}

func (a *adapter) Get(name string, required bool) ([]byte, error) {
	f, err := os.Open(a.path(name))
	if os.IsNotExist(err) {
		if required {
			return nil, errors.New(errors.Locked, "No vault keys are stored on this device. If it was in the vault before, run envden join")
		}

		return nil, nil
	}
	if err != nil {
		return nil, failure(err)
	}
	defer func() { _ = f.Close() }()
	s, err := f.Stat()
	if err != nil {
		return nil, failure(err)
	}
	if runtime.GOOS != "windows" && s.Mode().Perm()&0077 != 0 {
		return nil, errors.New(errors.InvalidData, "Key file is accessible to other users")
	}
	b, err := io.ReadAll(f)

	return b, failure(err)
}

func (a *adapter) Set(name string, value []byte) error {
	if err := os.MkdirAll(a.directory, 0700); err != nil {
		return failure(err)
	}
	if err := process.RestrictAccess(a.directory, true); err != nil {
		return failure(err)
	}
	f, err := os.OpenFile(filepath.Join(a.directory, newUUID()+".tmp"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return failure(err)
	}
	defer func() { _ = os.Remove(f.Name()) }()
	if err = process.RestrictAccess(f.Name(), false); err == nil {
		_, err = f.Write(value)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(f.Name(), a.path(name))
	}
	if err == nil {
		err = syncDirectory(a.directory)
	}

	return failure(err)
}

func (a *adapter) Delete(name string) error {
	err := os.Remove(a.path(name))
	if os.IsNotExist(err) {
		err = nil
	}
	if err == nil {
		err = syncDirectory(a.directory)
		if os.IsNotExist(err) {
			err = nil
		}
	}

	return failure(err)
}

func syncDirectory(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	return f.Sync()
}

func newUUID() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128

	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
