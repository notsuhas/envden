//go:build !windows

package lock

import "syscall"

func dead(pid int) bool { return syscall.Kill(pid, 0) == syscall.ESRCH }

func windowsStart(pid int) Process { return Process{Kind: "unknown"} }
