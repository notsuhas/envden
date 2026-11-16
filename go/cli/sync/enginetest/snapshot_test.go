package enginetest

import (
	"context"
	"database/sql"
	"io/fs"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"strings"
)

type treeEntry struct {
	path, target string
	mode         fs.FileMode
	bytes        []byte
}
type tableRows struct {
	name    string
	columns []string
	values  [][]any
}
type snapshot struct {
	root   string
	tree   []treeEntry
	tables []tableRows
	db     *sql.DB
}

func takeSnapshot(t testContext, root string) *snapshot {
	t.Helper()
	s := &snapshot{root: root}
	must(t, filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == root {
			return nil
		}
		if path == filepath.Join(root, "server") {
			return filepath.SkipDir
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		item := treeEntry{path: path, mode: info.Mode()}
		if info.Mode()&os.ModeSymlink != 0 {
			item.target, err = os.Readlink(path)
		} else if info.Mode().IsRegular() {
			item.bytes, err = os.ReadFile(path)
		}
		if err != nil {
			return err
		}
		s.tree = append(s.tree, item)
		return nil
	}))
	var err error
	s.db, err = sql.Open("sqlite", filepath.Join(root, "server", "envden.sqlite"))
	must(t, err)
	t.Cleanup(func() { must(t, s.db.Close()) })
	rows, err := s.db.Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
	must(t, err)
	names := []string{}
	for rows.Next() {
		var name string
		must(t, rows.Scan(&name))
		names = append(names, name)
	}
	must(t, rows.Err())
	must(t, rows.Close())
	for _, name := range names {
		rows, err := s.db.Query("SELECT * FROM " + quoteSQL(name))
		must(t, err)
		columns, err := rows.Columns()
		must(t, err)
		table := tableRows{name: name, columns: columns}
		for rows.Next() {
			values := make([]any, len(columns))
			ptrs := make([]any, len(values))
			for i := range values {
				ptrs[i] = &values[i]
			}
			must(t, rows.Scan(ptrs...))
			for i, v := range values {
				if b, ok := v.([]byte); ok {
					values[i] = append([]byte{}, b...)
				}
			}
			table.values = append(table.values, values)
		}
		must(t, rows.Err())
		must(t, rows.Close())
		s.tables = append(s.tables, table)
	}
	return s
}
func quoteSQL(name string) string { return "\"" + strings.ReplaceAll(name, "\"", "\"\"") + "\"" }
func (s *snapshot) restore(t testContext) {
	t.Helper()
	conn, err := s.db.Conn(context.Background())
	must(t, err)
	defer conn.Close()
	_, err = conn.ExecContext(context.Background(), "PRAGMA foreign_keys=OFF")
	must(t, err)
	tx, err := conn.BeginTx(context.Background(), nil)
	must(t, err)
	defer tx.Rollback()
	for _, table := range s.tables {
		_, err = tx.Exec("DELETE FROM " + quoteSQL(table.name))
		must(t, err)
	}
	for _, table := range s.tables {
		columns := []string{}
		marks := []string{}
		for _, column := range table.columns {
			columns = append(columns, quoteSQL(column))
			marks = append(marks, "?")
		}
		query := "INSERT INTO " + quoteSQL(table.name) + " (" + strings.Join(columns, ",") + ") VALUES (" + strings.Join(marks, ",") + ")"
		for _, values := range table.values {
			_, err = tx.Exec(query, values...)
			must(t, err)
		}
	}
	must(t, tx.Commit())
	entries, err := os.ReadDir(s.root)
	must(t, err)
	for _, entry := range entries {
		if entry.Name() != "server" {
			must(t, os.RemoveAll(filepath.Join(s.root, entry.Name())))
		}
	}
	for _, entry := range s.tree {
		if entry.mode.IsDir() {
			must(t, os.MkdirAll(entry.path, entry.mode.Perm()))
		} else if entry.mode&os.ModeSymlink != 0 {
			must(t, os.Symlink(entry.target, entry.path))
		} else {
			must(t, os.WriteFile(entry.path, entry.bytes, entry.mode.Perm()))
		}
	}
}
