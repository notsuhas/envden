package process

import "runtime"

func platformName() string {
	if runtime.GOOS == "windows" {
		return "win32"
	}

	return runtime.GOOS
}

func FixedDirectories(platform string) []string {
	if platform == "" {
		platform = platformName()
	}
	if platform == "win32" {
		return []string{`C:\Windows\System32`, `C:\Windows\System32\OpenSSH`, `C:\Windows\System32\WindowsPowerShell\v1.0`, `C:\Program Files\PowerShell\7`, `C:\Program Files\Git\cmd`, `C:\Program Files\Tailscale`}
	}
	system := []string{"/usr/bin", "/bin", "/usr/sbin", "/sbin", "/usr/local/bin"}
	if platform == "darwin" {
		return append(system, "/opt/homebrew/bin", "/Applications/Tailscale.app/Contents/MacOS")
	}

	return append(system, "/home/linuxbrew/.linuxbrew/bin", "/snap/bin")
}

func ManagerRoots(platform, arch string) []string {
	if platform == "" {
		platform = platformName()
	}
	if arch == "" {
		arch = runtime.GOARCH
	}
	if platform == "darwin" {
		if arch == "arm64" {
			return []string{"/opt/homebrew"}
		}

		return []string{"/usr/local/Homebrew"}
	}
	if platform == "linux" {
		return []string{"/home/linuxbrew/.linuxbrew"}
	}

	return []string{}
}
