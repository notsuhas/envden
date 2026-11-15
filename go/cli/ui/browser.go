package ui

import (
	"github.com/notsuhas/envden/go/core/process"
	"runtime"
)

func BrowserCommand(platform, url string) []string {
	if platform == "darwin" {
		return []string{"open", url}
	}
	if platform == "win32" {
		return []string{"rundll32", "url.dll,FileProtocolHandler", url}
	}
	return []string{"xdg-open", url}
}

func OpenBrowser(url string) bool {
	platform := runtime.GOOS
	if platform == "windows" {
		platform = "win32"
	}
	command := BrowserCommand(platform, url)
	return processBrowser(command)
}

func processBrowser(command []string) bool {
	result, err := process.ExecTrusted(command[0], command[1:], process.Options{Stdout: "ignore", Stderr: "ignore"})
	return err == nil && result.ExitCode == 0
}
