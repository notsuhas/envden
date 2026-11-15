package fs

import (
	"fmt"
	"github.com/google/uuid"
	e "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

func outside(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && (rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)))
}

func (p *placement) backup(b []byte) error {
	if p.backups == "" {
		return e.New("INVALID_INPUT", "Backup directory is required")
	}
	path, err := filepath.Abs(p.backups)
	if err != nil {
		return err
	}
	if !outside(p.root, path) {
		return e.New("INVALID_INPUT", "Backup directory must be outside checkout")
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
		return e.New("INVALID_INPUT", "Backup directory must be outside checkout")
	}
	st, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
		return e.New("INVALID_INPUT", "Unsafe backup directory")
	}
	if err = process.RestrictAccess(path, true); err != nil {
		return e.Wrap("INVALID_INPUT", "Could not restrict backup access", err)
	}
	name := fmt.Sprintf(".envden-backup-%d-%s", p.now(), uuid.NewString())
	f, err := os.OpenFile(filepath.Join(path, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(b)
	return err
}

var backupName = regexp.MustCompile(`^\.envden-backup-(\d+)-[0-9a-f-]{36}$`)

func PruneBackups(dir string, now int64, maxAgeDays ...float64) error {
	days := float64(30)
	if len(maxAgeDays) > 0 {
		days = maxAgeDays[0]
	}
	if math.IsNaN(days) || math.IsInf(days, 0) || days < 0 {
		return e.New("INVALID_INPUT", "Invalid backup retention")
	}
	st, err := os.Lstat(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
		return e.New("INVALID_INPUT", "Unsafe backup directory")
	}
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
		st, err := lstat(filepath.Join(dir, entry.Name()))
		if err != nil {
			return err
		}
		if st != nil && st.Mode().IsRegular() {
			if err = os.Remove(filepath.Join(dir, entry.Name())); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}
	return nil
}
