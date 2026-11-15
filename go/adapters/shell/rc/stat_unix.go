//go:build !windows

package rc

import (
	"os"
	"reflect"
	"syscall"

	"github.com/notsuhas/envden/go/core/errors"
)

const noFollow = syscall.O_NOFOLLOW

func validateRC(_ string, s os.FileInfo) error {
	st := s.Sys().(*syscall.Stat_t)
	if !s.Mode().IsRegular() || st.Nlink != 1 || int(st.Uid) != os.Getuid() {
		return errors.New(errors.InvalidInput, "Unsafe shell configuration file")
	}

	return nil
}

func sameRC(a, b os.FileInfo) bool {
	return os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime().Equal(b.ModTime()) && reflect.DeepEqual(changeTime(a), changeTime(b))
}

func safeBackup(s os.FileInfo) bool {
	st := s.Sys().(*syscall.Stat_t)

	return s.IsDir() && int(st.Uid) == os.Getuid() && s.Mode().Perm()&0077 == 0
}

func verifyOwner(string) error { return nil }

func prepareBackup(string) error { return nil }

func changeTime(s os.FileInfo) any {
	v := reflect.ValueOf(s.Sys()).Elem()
	for _, name := range []string{"Ctimespec", "Ctim"} {
		f := v.FieldByName(name)
		if f.IsValid() {
			return f.Interface()
		}
	}

	return nil
}
