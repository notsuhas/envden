package lock

import (
	"golang.org/x/sys/windows"
	"strconv"
)

func dead(pid int) bool { return windowsStart(pid).Kind == "dead" }
func windowsStart(pid int) Process {
	h, err := windows.OpenProcess(0x1000, false, uint32(pid))
	if err != nil {
		if err == windows.ERROR_INVALID_PARAMETER {
			return Process{Kind: "dead"}
		}
		return Process{Kind: "unknown"}
	}
	defer windows.CloseHandle(h)
	var creation, exit, kernel, user windows.Filetime
	if windows.GetProcessTimes(h, &creation, &exit, &kernel, &user) != nil {
		return Process{Kind: "unknown"}
	}
	ticks := uint64(creation.HighDateTime)<<32 | uint64(creation.LowDateTime)
	return Process{Kind: "live", StartedAt: strconv.FormatUint(ticks, 10)}
}
