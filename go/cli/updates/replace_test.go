package updates

import (
	"fmt"
	"github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"testing"
)

func TestReplaceRollback(t *testing.T) {
	for _, stage := range []string{"verify", "after", "success"} {
		t.Run(stage, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "envden")
			if e := os.WriteFile(path, []byte("old"), 0755); e != nil {
				t.Fatal(e)
			}
			e := ReplaceBinary(path, []byte("new"), false, func(string) error {
				if stage == "verify" {
					return fmt.Errorf("bad")
				}
				return nil
			}, func() error {
				if stage == "after" {
					return fmt.Errorf("bad")
				}
				return nil
			}, func() int64 { return 0 })
			if stage == "verify" && !errors.Is(e, errors.InvalidData) {
				t.Fatal(e)
			}
			raw, _ := os.ReadFile(path)
			want := "old"
			if stage == "success" {
				want = "new"
				if e != nil {
					t.Fatal(e)
				}
			}
			if string(raw) != want {
				t.Fatal(string(raw))
			}
			if _, e = os.Stat(path + ".envden-new"); !os.IsNotExist(e) {
				t.Fatal(e)
			}
		})
	}
}
