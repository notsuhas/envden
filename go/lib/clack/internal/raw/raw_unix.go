//go:build darwin || linux

package raw

import (
	"golang.org/x/sys/unix"
	"golang.org/x/term"
)

func Make(fd int) (*term.State, error) {
	original, err := unix.IoctlGetTermios(fd, readTermios)
	if err != nil {
		return nil, err
	}
	state, err := term.MakeRaw(fd)
	if err != nil {
		return nil, err
	}
	raw, err := unix.IoctlGetTermios(fd, readTermios)
	if err != nil {
		_ = term.Restore(fd, state)

		return nil, err
	}
	raw.Oflag = original.Oflag
	if err = unix.IoctlSetTermios(fd, writeTermios, raw); err != nil {
		_ = term.Restore(fd, state)

		return nil, err
	}

	return state, nil
}
