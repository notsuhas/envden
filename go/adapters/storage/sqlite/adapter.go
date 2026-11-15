package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/notsuhas/envden/go/core/adapters"
	envErrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"regexp"
)

type storage struct {
	db           *sql.DB
	conn         *sql.Conn
	dir          string
	depth        int
	maintainedAt int64
}

var _ adapters.Storage = (*storage)(nil)

// Calls on one instance must be serialized, matching the synchronous TS adapter.
func CreateSqliteStorageAdapter(dir string, now int64) (result adapters.Storage, err error) {
	defer recoverError(&err)
	must(os.MkdirAll(dir, 0700))
	must(process.RestrictAccessSync(dir, true))
	path := filepath.Join(dir, "envden.sqlite")
	_, statErr := os.Stat(path)
	existed := statErr == nil
	restrictFiles(dir)
	db, e := sql.Open("sqlite", path)
	must(e)
	defer func() {
		if result == nil {
			db.Close()
		}
	}()
	conn, e := db.Conn(context.Background())
	must(e)
	defer func() {
		if result == nil {
			conn.Close()
		}
	}()
	s := &storage{db: db, conn: conn, dir: dir, maintainedAt: now - 60000}
	s.run("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;")
	restrictFiles(dir)
	s.tx(func() {
		var version int
		must(s.conn.QueryRowContext(context.Background(), "PRAGMA user_version").Scan(&version))
		if version != 0 && version != 1 {
			panic(envErrors.New("INVALID_INPUT", "Incompatible server database format"))
		}
		if version == 0 {
			if existed {
				s.backup(version)
			}
			s.run(schema)
		}
	})

	s.pruneBackups(now)
	s.tx(func() { s.recoverBlobs(now) })
	return s, nil
}

func restrictFiles(dir string) {
	for _, n := range []string{"envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm", "identity.json"} {
		path := filepath.Join(dir, n)
		if _, err := os.Stat(path); err == nil {
			must(process.RestrictAccessSync(path, false))
		}
	}
}

func (s *storage) backup(version int) {
	path := filepath.Join(s.dir, fmt.Sprintf("pre-%d", version+1))
	var b []byte
	must(s.conn.Raw(func(driverConn any) error {
		var err error
		b, err = driverConn.(interface{ Serialize() ([]byte, error) }).Serialize()
		return err
	}))
	f, e := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	must(e)
	defer f.Close()
	_, e = f.Write(b)
	must(e)
	must(f.Sync())
	syncDir(s.dir)
}

func (s *storage) pruneBackups(now int64) {
	entries, e := os.ReadDir(s.dir)
	must(e)
	for _, entry := range entries {
		if regexp.MustCompile(`^pre-\d+$`).MatchString(entry.Name()) {
			info, e := entry.Info()
			must(e)
			if now-info.ModTime().UnixMilli() >= 30*86400000 {
				must(os.Remove(filepath.Join(s.dir, entry.Name())))
			}
		}
	}
}

func (s *storage) maintain(now int64) {
	if now-s.maintainedAt < 60000 {
		return
	}
	s.pruneBackups(now)
	s.tx(func() {
		for _, table := range []string{"nonces", "sessions", "approvers"} {
			s.run("DELETE FROM "+table+" WHERE expires<=?", now)
		}
	})
	s.maintainedAt = now
}
