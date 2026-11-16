package files

import (
	"bytes"
	"crypto/sha256"
	"os"
	"path/filepath"
	"runtime"

	"github.com/notsuhas/envden/go/cli/state/files"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
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
		return nil, envdenerrors.New(envdenerrors.InvalidData, "Unsafe sync file")
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

	return filepath.Join(home, "base", encoding.Base32(hash[:]))
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

		defer func() { _ = f.Close() }() // Best-effort cleanup preserves the original operation result.

		return f.Sync()
	}

	return nil
}
