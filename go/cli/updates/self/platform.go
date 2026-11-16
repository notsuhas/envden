package self

import (
	"strings"

	"github.com/notsuhas/envden/go/core/process"
	"github.com/notsuhas/envden/go/core/textcase"
)

func currentReleasePlatform(platform, arch string, run func(string, ...string) ([]byte, error)) string {
	if arch == "amd64" {
		arch = "x64"
	}
	glibc := ""
	if platform == "linux" {
		output, err := run("getconf", "GNU_LIBC_VERSION")
		if err == nil && strings.HasPrefix(textcase.Trim(string(output)), "glibc ") {
			glibc = string(output)
		} else {
			output, _ = run("ldd", "--version")
			if strings.Contains(string(output), "GNU libc") || strings.Contains(string(output), "GLIBC") {
				glibc = string(output)
			}
		}
	}

	return ReleasePlatform(platform, arch, glibc)
}

func detectLibcCommand(name string, args ...string) ([]byte, error) {
	result, err := process.ExecTrusted(name, args, process.Options{})

	return []byte(result.Stdout), err
}
