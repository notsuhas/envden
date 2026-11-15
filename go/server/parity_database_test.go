package server

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	a "github.com/notsuhas/envden/go/core/adapters"
	x "github.com/notsuhas/envden/go/server/shared"
	_ "modernc.org/sqlite"
	"regexp"
	"sort"
	"testing"
)

func readTables(t *testing.T, path string) map[string][]map[string]any {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	result := map[string][]map[string]any{}
	names, err := db.Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for names.Next() {
		var name string
		if err = names.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	names.Close()
	for _, name := range tables {
		result[name] = []map[string]any{}
		rows, err := db.Query("SELECT * FROM " + name)
		if err != nil {
			t.Fatal(err)
		}
		columns, err := rows.Columns()
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			values := make([]any, len(columns))
			pointers := make([]any, len(columns))
			for i := range values {
				pointers[i] = &values[i]
			}
			if err = rows.Scan(pointers...); err != nil {
				t.Fatal(err)
			}
			row := map[string]any{}
			for i, key := range columns {
				value := values[i]
				switch v := value.(type) {
				case []byte:
					value = map[string]any{"blob": base64.StdEncoding.EncodeToString(v)}
				case int64:
					value = float64(v)
				}
				row[key] = value
			}
			result[name] = append(result[name], row)
		}
		rows.Close()
	}
	return result
}

var uuidPattern = regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)

func normalizeTables(input map[string][]map[string]any) map[string][]string {
	out := map[string][]string{}
	for name, rows := range input {
		normalized := []string{}
		for _, row := range rows {
			copy := map[string]any{}
			for key, value := range row {
				copy[key] = value
			}
			if name == "sessions" {
				for key, value := range copy {
					if blob, ok := value.(map[string]any); ok {
						if encoded, ok := blob["blob"].(string); ok {
							data, _ := base64.StdEncoding.DecodeString(encoded)
							var login map[string]any
							if json.Unmarshal(data, &login) == nil && login["state"] != nil {
								login["state"] = "<random opaque state>"
								data = x.JSON(login)
							}
							data = uuidPattern.ReplaceAll(data, []byte("<receipt>"))
							copy[key] = map[string]any{"blob": base64.StdEncoding.EncodeToString(data)}
						}
					}
				}
			}
			for key, value := range copy {
				if text, ok := value.(string); ok {
					copy[key] = uuidPattern.ReplaceAllString(text, "<receipt>")
				}
			}
			data, _ := json.Marshal(copy)
			normalized = append(normalized, string(data))
		}
		sort.Strings(normalized)
		out[name] = normalized
	}
	return out
}

type parityFaultStorage struct {
	a.Storage
	faults map[string]any
}

func (s parityFaultStorage) HasVault(id []byte) (bool, error) {
	if s.faults["hasVault"] == "throw" {
		return false, errors.New("injected failure")
	}
	return s.Storage.HasVault(id)
}
func (s parityFaultStorage) WriteState(id []byte, writes []a.StateWrite) error {
	if s.faults["writeState"] == "throw" {
		return errors.New("injected failure")
	}
	return s.Storage.WriteState(id, writes)
}
func (s parityFaultStorage) FileList(id, hash []byte) ([]byte, error) {
	if s.faults["fileList"] == "missing" {
		return nil, nil
	}
	return s.Storage.FileList(id, hash)
}
func (s parityFaultStorage) State(id []byte, kind a.StateKind, key []byte) ([]byte, error) {
	if kinds, ok := s.faults["state"].([]any); ok {
		for _, missing := range kinds {
			if missing == string(kind) {
				return nil, nil
			}
		}
	}
	return s.Storage.State(id, kind, key)
}
