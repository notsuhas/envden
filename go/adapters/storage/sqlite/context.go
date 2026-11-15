package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"runtime"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func recoverError(err *error) {
	if v := recover(); v != nil {
		if e, ok := v.(error); ok {
			*err = e
		} else {
			panic(v)
		}
	}
}

func (s *storage) run(q string, args ...any) int64 {
	r, e := s.conn.ExecContext(context.Background(), q, args...)
	must(e)
	n, e := r.RowsAffected()
	must(e)
	return n
}

func (s *storage) rows(q string, args ...any) *sql.Rows {
	r, e := s.conn.QueryContext(context.Background(), q, args...)
	must(e)
	return r
}

func (s *storage) bytes(q string, args ...any) []byte {
	var b []byte
	e := s.conn.QueryRowContext(context.Background(), q, args...).Scan(&b)
	if errors.Is(e, sql.ErrNoRows) {
		return nil
	}
	must(e)
	return b
}

func (s *storage) count(q string, args ...any) int64 {
	var n int64
	must(s.conn.QueryRowContext(context.Background(), q, args...).Scan(&n))
	return n
}

func (s *storage) tx(fn func()) {
	name := fmt.Sprintf("envden_%d", s.depth)
	if s.depth == 0 {
		s.run("BEGIN IMMEDIATE")
	} else {
		s.run("SAVEPOINT " + name)
	}
	s.depth++
	defer func() {
		s.depth--
		if v := recover(); v != nil {
			if s.depth == 0 {
				s.run("ROLLBACK")
			} else {
				s.run("ROLLBACK TO " + name)
				s.run("RELEASE " + name)
			}
			panic(v)
		}
	}()
	fn()
	if s.depth == 1 {
		s.run("COMMIT")
	} else {
		s.run("RELEASE " + name)
	}
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

func (s *storage) Transaction(fn func() error) (err error) {
	defer recoverError(&err)
	s.tx(func() { must(fn()) })
	s.collectGarbage()
	return nil
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

func syncDir(path string) {
	if runtime.GOOS == "windows" {
		return
	}
	f, e := os.Open(path)
	must(e)
	defer f.Close()
	must(f.Sync())
}
