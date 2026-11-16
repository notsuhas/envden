//go:build !darwin && !freebsd && !openbsd && !netbsd && !dragonfly && !linux && !windows

package input

import "os"

func Discard(*os.File) {}
