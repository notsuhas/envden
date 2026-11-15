package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"github.com/notsuhas/envden/go/core/adapters"
	envErrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	_ "modernc.org/sqlite"
)

type storage struct {
	db           *sql.DB
	conn         *sql.Conn
	dir          string
	depth        int
	maintainedAt int64
}

var _ adapters.Storage = (*storage)(nil)

func CreateSqliteStorageAdapter(dir string, now int64) (result adapters.Storage, err error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	if err := process.RestrictAccessSync(dir, true); err != nil {
		return nil, err
	}

	path := filepath.Join(dir, "envden.sqlite")
	_, statErr := os.Stat(path)
	existed := statErr == nil
	if err := restrictFiles(dir); err != nil {
		return nil, err
	}

	db, e := sql.Open("sqlite", path)
	if err := e; err != nil {
		return nil, err
	}

	defer func() {
		if result == nil {
			_ = db.Close()
		}
	}()
	conn, e := db.Conn(context.Background())
	if err := e; err != nil {
		return nil, err
	}

	defer func() {
		if result == nil {
			_ = conn.Close()
		}
	}()
	s := &storage{db: db, conn: conn, dir: dir, maintainedAt: now - 60000}
	_, err = s.run("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;")
	if err != nil {
		return nil, err
	}
	if err := restrictFiles(dir); err != nil {
		return nil, err
	}
	if err := s.tx(func() error {
		var version int
		if err := s.conn.QueryRowContext(context.Background(), "PRAGMA user_version").Scan(&version); err != nil {
			return err
		}
		if version != 0 && version != 1 {
			return envErrors.New("INVALID_INPUT", "Incompatible server database format")
		}
		if version == 0 {
			if existed {
				if err := s.backup(version); err != nil {
					return err
				}
			}
			_, err := s.run(schema)
			if err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return nil, err
	}
	if err := s.pruneBackups(now); err != nil {
		return nil, err
	}
	if err := s.tx(func() error {
		return s.recoverBlobs(now)
	}); err != nil {
		return nil, err
	}

	return s, nil
}

func restrictFiles(dir string) error {
	for _, n := range []string{"envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm", "identity.json"} {
		path := filepath.Join(dir, n)
		_, err := os.Stat(path)
		if err == nil {
			if err := process.RestrictAccessSync(path, false); err != nil {
				return err
			}
		}
	}

	return nil
}

func (s *storage) backup(version int) error {
	path := filepath.Join(s.dir, fmt.Sprintf("pre-%d", version+1))
	var b []byte
	if err := s.conn.Raw(func(driverConn any) error {
		var err error
		b, err = driverConn.(interface{ Serialize() ([]byte, error) }).Serialize()

		return err
	}); err != nil {
		return err
	}

	f, e := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err := e; err != nil {
		return err
	}

	defer func() { _ = f.Close() }()
	_, e = f.Write(b)
	if err := e; err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}

	return syncDir(s.dir)
}

func (s *storage) pruneBackups(now int64) error {
	entries, e := os.ReadDir(s.dir)
	if err := e; err != nil {
		return err
	}

	for _, entry := range entries {
		if regexp.MustCompile(`^pre-\d+$`).MatchString(entry.Name()) {
			info, e := entry.Info()
			if err := e; err != nil {
				return err
			}
			if now-info.ModTime().UnixMilli() >= 30*86400000 {
				if err := os.Remove(filepath.Join(s.dir, entry.Name())); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

func (s *storage) maintain(now int64) error {
	if now-s.maintainedAt < 60000 {
		return nil
	}
	if err := s.pruneBackups(now); err != nil {
		return err
	}
	if err := s.tx(func() error {
		for _, table := range []string{"nonces", "sessions", "approvers"} {
			_, err := s.run("DELETE FROM "+table+" WHERE expires<=?", now)
			if err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return err
	}

	s.maintainedAt = now

	return nil
}
