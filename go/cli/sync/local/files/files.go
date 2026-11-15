package files

import (
	"bytes"
	"crypto/sha256"
	"os"
	"path/filepath"
	"runtime"

	"github.com/notsuhas/envden/go/cli/state/files"
	e "github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func ReadBytes(path string) ([]byte, error) {
	stat, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !stat.Mode().IsRegular() {
		return nil, e.New(e.InvalidData, "Unsafe sync file")
	}

	return os.ReadFile(path)
}

func Same(a, b []byte) bool { return (a == nil) == (b == nil) && bytes.Equal(a, b) }

func BasePath(home, store string, root ...string) string {
	value := store
	if len(root) > 0 && root[0] != "" {
		value += "\x00" + root[0]
	}
	hash := sha256.Sum256([]byte(value))

	return filepath.Join(home, "base", b.Base32(hash[:]))
}

func WriteBytes(path string, value []byte, now func() int64) error {
	old, err := ReadBytes(path)
	if err != nil {
		return err
	}
	if Same(old, value) {
		return nil
	}
	if value != nil {
		return files.AtomicWrite(path, value, now)
	}
	if err = os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	if runtime.GOOS != "windows" {
		f, err := os.Open(filepath.Dir(path))
		if err != nil {
			return err
		}
		defer f.Close()

		return f.Sync()
	}

	return nil
}
