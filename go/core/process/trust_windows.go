//go:build windows

package process

import "os"

func trustedInfo(info os.FileInfo) bool { return true }

func executable(p string, info os.FileInfo) bool { return true }

func processExitCode(state *os.ProcessState) int { return state.ExitCode() }

func currentUID() int { return -1 }
