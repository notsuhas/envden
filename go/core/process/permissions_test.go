package process

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestRestrictAccess(t *testing.T) {
	root := t.TempDir()
	for _, directory := range []bool{false, true} {
		p := filepath.Join(root, "file")
		if directory {
			p = filepath.Join(root, "dir")
			mkdir(t, p)
		} else {
			writeTool(t, p, "secret")
		}
		for _, fn := range []func(string, bool, ...PermissionRuntime) error{RestrictAccess, RestrictAccessSync} {
			if err := fn(p, directory); err != nil {
				t.Fatal(err)
			}
			if platformName() != "win32" {
				info, _ := os.Stat(p)
				want := os.FileMode(0600)
				if directory {
					want = 0700
				}
				if info.Mode().Perm() != want {
					t.Fatal(info.Mode())
				}
			}
			rights := "F"
			if directory {
				rights = "(OI)(CI)F"
			}
			err := fn(p, directory, PermissionRuntime{Platform: "win32", Username: "test-user", Exec: func(name string, args []string) error {
				if name != "icacls" || !reflect.DeepEqual(args, []string{p, "/inheritance:r", "/grant:r", "test-user:" + rights}) {
					t.Fatal(name, args)
				}

				return nil
			}})
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	failure := errors.New("ACL denied")
	if got := RestrictAccess(root, true, PermissionRuntime{Platform: "win32", Username: "test", Exec: func(string, []string) error { return failure }}); !errors.Is(got, failure) {
		t.Fatal(got)
	}
}
