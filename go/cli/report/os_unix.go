//go:build !windows

package report

import (
	"golang.org/x/sys/unix"
	"strings"
)

func OSRelease() string {
	var info unix.Utsname
	if unix.Uname(&info) != nil {
		return ""
	}
	var text strings.Builder
	for _, c := range info.Release {
		if c == 0 {
			break
		}
		text.WriteByte(byte(c))
	}
	return text.String()
}
