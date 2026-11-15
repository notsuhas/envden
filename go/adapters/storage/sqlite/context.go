package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"runtime"
)

func (s *storage) run(q string, args ...any) (int64, error) {
	r, e := s.conn.ExecContext(context.Background(), q, args...)
	if err := e; err != nil {
		return 0, err
	}

	n, e := r.RowsAffected()
	if err := e; err != nil {
		return 0, err
	}

	return n, nil
}

func (s *storage) rows(q string, args ...any) (*sql.Rows, error) {
	r, e := s.conn.QueryContext(context.Background(), q, args...)
	if err := e; err != nil {
		return nil, err
	}

	return r, nil
}

func (s *storage) bytes(q string, args ...any) ([]byte, error) {
	var b []byte
	e := s.conn.QueryRowContext(context.Background(), q, args...).Scan(&b)
	if errors.Is(e, sql.ErrNoRows) {
		return nil, nil
	}
	if err := e; err != nil {
		return nil, err
	}

	return b, nil
}

func (s *storage) count(q string, args ...any) (int64, error) {
	var n int64
	if err := s.conn.QueryRowContext(context.Background(), q, args...).Scan(&n); err != nil {
		return 0, err
	}

	return n, nil
}

func (s *storage) tx(fn func() error) (err error) {
	name := fmt.Sprintf("envden_%d", s.depth)
	begin, commit, rollback := "BEGIN IMMEDIATE", "COMMIT", "ROLLBACK"
	if s.depth > 0 {
		begin = "SAVEPOINT " + name
		commit = "RELEASE " + name
		rollback = "ROLLBACK TO " + name
	}
	if _, err = s.conn.ExecContext(context.Background(), begin); err != nil {
		return err
	}
	s.depth++
	committed := false
	defer func() {
		s.depth--
		if !committed {
			if _, rollbackErr := s.conn.ExecContext(context.Background(), rollback); rollbackErr != nil {
				err = rollbackErr

				return
			}
			if s.depth > 0 {
				if _, releaseErr := s.conn.ExecContext(context.Background(), "RELEASE "+name); releaseErr != nil {
					err = releaseErr
				}
			}
		}
	}()
	if err = fn(); err != nil {
		return err
	}
	_, err = s.conn.ExecContext(context.Background(), commit)
	committed = err == nil

	return err
}

func (s *storage) ID() string { return "sqlite" }

func (s *storage) Close() error {
	e := s.conn.Close()
	e2 := s.db.Close()
	if e != nil {
		return e
	}

	return e2
}

func (s *storage) Transaction(fn func() error) error {
	err := s.tx(fn)
	if err != nil {
		return err
	}

	return s.collectGarbage()
}

func optional(b []byte) any {
	if b == nil {
		return nil
	}

	return b
}

func bit(b bool) int {
	if b {
		return 1
	}

	return 0
}

func syncDir(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	f, e := os.Open(path)
	if err := e; err != nil {
		return err
	}

	defer func() { _ = f.Close() }()

	return f.Sync()
}
