package fsmeta

import (
	"os"
	"strconv"
	"syscall"
)

func Identity(_ string, info os.FileInfo) (uint64, uint64, string, error) {
	s := info.Sys().(*syscall.Stat_t)

	return uint64(s.Dev), s.Ino, strconv.FormatFloat(float64(s.Birthtimespec.Sec)*1000+float64(s.Birthtimespec.Nsec)/1e6, 'f', -1, 64), nil //nolint:gosec // G115: device identity preserves the OS bit pattern, not an arithmetic quantity.
}
