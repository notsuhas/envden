package fsmeta

import (
	"os"
	"strconv"
	"syscall"

	"golang.org/x/sys/unix"
)

func Identity(path string, info os.FileInfo) (uint64, uint64, string, error) {
	s := info.Sys().(*syscall.Stat_t)
	var x unix.Statx_t
	birth := float64(0)
	if unix.Statx(unix.AT_FDCWD, path, unix.AT_SYMLINK_NOFOLLOW, unix.STATX_BTIME, &x) == nil && x.Mask&unix.STATX_BTIME != 0 {
		birth = float64(x.Btime.Sec)*1000 + float64(x.Btime.Nsec)/1e6
	}
	return uint64(s.Dev), s.Ino, strconv.FormatFloat(birth, 'f', -1, 64), nil
}
