//go:build !windows

package process

import (
	"os"
	"syscall"
)

func trustedInfo(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && TrustedOwnerAndMode(uint32(info.Mode().Perm()), stat.Uid, stat.Gid, platformName())
}
func executable(p string, _ os.FileInfo) bool { return syscall.Access(p, 1) == nil }

func processExitCode(state *os.ProcessState) int {
	if status, ok := state.Sys().(syscall.WaitStatus); ok && status.Signaled() {
		return 128 + int(status.Signal())
	}
	return state.ExitCode()
}

func currentUID() int { return os.Getuid() }
