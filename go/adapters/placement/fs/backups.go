//go:build !windows

package fs

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"golang.org/x/sys/unix"
)

func outside(root, path string) bool {
	rel, err := filepath.Rel(root, path)

	return err == nil && (rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)))
}

func (p *placement) backup(b []byte) error {
	if p.backups == "" {
		return enverrors.New("INVALID_INPUT", "Backup directory is required")
	}
	path, err := filepath.Abs(p.backups)
	if err != nil {
		return err
	}
	if !outside(p.root, path) {
		return enverrors.New("INVALID_INPUT", "Backup directory must be outside checkout")
	}
	if err = os.MkdirAll(path, 0700); err != nil {
		return err
	}
	rootReal, err := filepath.EvalSymlinks(p.root)
	if err != nil {
		return err
	}
	pathReal, err := filepath.EvalSymlinks(path)
	if err != nil {
		return err
	}
	if !outside(rootReal, pathReal) {
		return enverrors.New("INVALID_INPUT", "Backup directory must be outside checkout")
	}
	name := fmt.Sprintf(".envden-backup-%d-%s", p.now(), uuid.NewString())
	fd, err := openParent(path, name, false)
	if err != nil {
		return err
	}
	defer func() { _ = unix.Close(fd) }()
	if err = unix.Fchmod(fd, 0700); err != nil {
		return err
	}

	return writeAt(fd, name, b)
}

var backupName = regexp.MustCompile(`^\.envden-backup-(\d+)-[0-9a-f-]{36}$`)

func PruneBackups(dir string, now int64, maxAgeDays ...float64) error {
	days := float64(30)
	if len(maxAgeDays) > 0 {
		days = maxAgeDays[0]
	}
	if math.IsNaN(days) || math.IsInf(days, 0) || days < 0 {
		return enverrors.New("INVALID_INPUT", "Invalid backup retention")
	}
	st, err := os.Lstat(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
		return enverrors.New("INVALID_INPUT", "Unsafe backup directory")
	}
	fd, err := openParent(dir, ".entry", false)
	if err != nil {
		return err
	}
	defer func() { _ = unix.Close(fd) }()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	cutoff := float64(now) - days*86400000
	for _, entry := range entries {
		m := backupName.FindStringSubmatch(entry.Name())
		if m == nil {
			continue
		}
		timestamp, _ := strconv.ParseFloat(m[1], 64)
		if timestamp >= cutoff {
			continue
		}
		before, err := identity(fd, entry.Name())
		if err != nil {
			return err
		}
		if before == nil {
			continue
		}
		if _, linked := linkTarget(fd, entry.Name()); linked {
			continue
		}
		file, err := unix.Openat(fd, entry.Name(), unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK, 0)
		if err != nil {
			return descriptor(err)
		}
		f := os.NewFile(uintptr(file), entry.Name())
		info, err := f.Stat()
		_ = f.Close()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			continue
		}
		if err = assertIdentity(fd, entry.Name(), before); err != nil {
			return err
		}
		if err = unix.Unlinkat(fd, entry.Name(), 0); err != nil {
			return descriptor(err)
		}
	}

	return nil
}
