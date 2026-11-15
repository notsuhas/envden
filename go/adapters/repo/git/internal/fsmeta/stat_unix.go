//go:build !windows

package fsmeta

import (
	"os"
	"syscall"
)

const NoFollow = syscall.O_NOFOLLOW

const NonBlock = syscall.O_NONBLOCK

func PrivateRegular(_ string, s os.FileInfo) bool {
	st := s.Sys().(*syscall.Stat_t)

	return s.Mode().IsRegular() && st.Nlink == 1 && int(st.Uid) == os.Getuid()
}
