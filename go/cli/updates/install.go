package updates

import (
	"github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Method struct {
	Kind    string
	Command []string
}

func InstallMethod(home, recorded, binary string, env map[string]string) (Method, error) {
	detected := ""
	normalized := strings.ReplaceAll(binary, "\\", "/")
	if strings.Contains(normalized, "/Cellar/envden/") {
		detected = "brew"
	} else if regexp.MustCompile(`(?i)/Microsoft/WinGet/(Packages|Links)/`).MatchString(normalized) {
		detected = "winget"
	} else if filepath.Clean(filepath.Dir(binary)) == filepath.Join(home, "bin") {
		detected = "script"
	}
	value := detected
	if detected == "script" || detected == "" {
		value = recorded
		if value == "" {
			value = env["ENVDEN_INSTALL_METHOD"]
		}
		if value == "" {
			saved, e := os.ReadFile(filepath.Join(home, "install-method"))
			if e == nil {
				value = string(saved)
			} else if !os.IsNotExist(e) {
				return Method{}, e
			}
		}
		if value == "" {
			value = detected
		}
	}
	commands := map[string][]string{"brew": {"brew", "upgrade", "envden"}, "npm": {"npm", "i", "-g", "envden@latest"}, "scoop": {"scoop", "update", "envden"}, "winget": {"winget", "upgrade", "envden"}}
	if value == "script" {
		return Method{Kind: "script"}, nil
	}
	if command, ok := commands[value]; ok {
		return Method{Kind: "manager", Command: command}, nil
	}
	return Method{}, errors.New(errors.InvalidInput, "Install method is unknown; reinstall using your installer")
}
