//go:build !windows

package report

import (
	"strings"

	"golang.org/x/sys/unix"
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

		text.WriteByte(c)
	}

	return text.String()
}
