//go:build darwin || freebsd || openbsd || netbsd || dragonfly

package input

import (
	"golang.org/x/sys/unix"
	"os"
)

func Discard(file *os.File) {
	fd := int(file.Fd())
	if state, err := unix.IoctlGetTermios(fd, unix.TIOCGETA); err == nil {
		_ = unix.IoctlSetTermios(fd, unix.TIOCSETAF, state)
	}
}
