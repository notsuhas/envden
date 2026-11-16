package local

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var backupPattern = regexp.MustCompile(`(?:\.corrupt-|^\.?)(\d{13})_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\.tmp)?$`)

func PruneBackups(home string, now int64) error {
	for _, directory := range []string{"state", "base", "conflicts/backups"} {
		if err := pruneDirectory(filepath.Join(home, directory), now, directory != "conflicts/backups"); err != nil {
			return err
		}
	}

	return nil
}

func pruneDirectory(directory string, now int64, recursive bool) error {
	entries, err := os.ReadDir(directory)

	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".lock") {
			continue
		}

		path := filepath.Join(directory, entry.Name())
		match := backupPattern.FindStringSubmatch(entry.Name())

		if len(match) > 0 {
			stamp, _ := strconv.ParseInt(match[1], 10, 64)

			if now-stamp >= 30*24*60*60*1000 {
				if err := os.RemoveAll(path); err != nil {
					return err
				}

				continue
			}
		}

		if recursive && entry.IsDir() {
			if err := pruneDirectory(path, now, true); err != nil {
				return err
			}
		}
	}

	return nil
}
