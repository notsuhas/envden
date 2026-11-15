package rc

import (
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/core/errors"
)

func backupRC(directory string, b []byte) error {
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	if err := prepareBackup(directory); err != nil {
		return err
	}
	folder, err := os.OpenFile(directory, os.O_RDONLY|noFollow, 0)
	if err != nil {
		return err
	}
	defer func() { _ = folder.Close() }()
	s, err := folder.Stat()
	if err != nil {
		return err
	}
	if !safeBackup(s) {
		return errors.New(errors.InvalidInput, "Unsafe shell backup directory")
	}
	f, err := os.OpenFile(filepath.Join(directory, ".envden-backup-"+uuid()), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	if _, err = f.Write(b); err != nil {
		return err
	}

	return f.Sync()
}

func uuid() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128

	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
