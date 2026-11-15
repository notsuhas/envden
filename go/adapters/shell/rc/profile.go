package rc

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func bashRCPath(home, platform string) string {
	if platform != "darwin" {
		return filepath.Join(home, ".bashrc")
	}
	names := []string{".bashrc", ".bash_profile", ".bash_login", ".profile"}
	contents := map[string]string{}
	for _, name := range names {
		b, err := os.ReadFile(filepath.Join(home, name))
		if err == nil {
			contents[name] = string(b)
		} else if !os.IsNotExist(err) {
			panic(err)
		}
	}
	for _, name := range names {
		if strings.Contains(contents[name], start) {
			return filepath.Join(home, name)
		}
	}
	source := regexp.MustCompile(`(?:^|[\s;&|])(?:source|\.)\s+["']?(?:~|\$HOME|\$\{HOME\})/\.bashrc["']?(?:\s|;|$)`)
	for _, name := range names[1:] {
		if text, ok := contents[name]; ok {
			for _, line := range strings.Split(text, "\n") {
				if !strings.HasPrefix(strings.TrimLeft(line, " \t"), "#") && source.MatchString(line) {
					return filepath.Join(home, ".bashrc")
				}
			}
			return filepath.Join(home, name)
		}
	}
	return filepath.Join(home, ".bash_profile")
}
