package report

import (
	"fmt"
	"golang.org/x/sys/windows"
)

func OSRelease() string {
	v := windows.RtlGetVersion()
	return fmt.Sprintf("%d.%d.%d", v.MajorVersion, v.MinorVersion, v.BuildNumber)
}
