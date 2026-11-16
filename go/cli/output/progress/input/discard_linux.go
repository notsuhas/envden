//go:build linux

package input

import (
	"golang.org/x/sys/unix"
	"os"
)

func Discard(file *os.File) { _ = unix.IoctlSetInt(int(file.Fd()), unix.TCFLSH, unix.TCIFLUSH) }
