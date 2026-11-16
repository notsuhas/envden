package process

import (
	"os"
	"strings"

	"github.com/notsuhas/envden/go/core/textcase"
)

var allowedNames = map[string]bool{}

func init() {
	for _, key := range strings.Fields("HOME XDG_CONFIG_HOME USER LOGNAME LANG TERM TMPDIR TMP TEMP SYSTEMROOT SYSTEMDRIVE WINDIR COMSPEC PATHEXT USERPROFILE APPDATA LOCALAPPDATA PROGRAMDATA PROGRAMFILES PROGRAMFILES(X86) HOMEDRIVE HOMEPATH") {
		allowedNames[textcase.Lower(key)] = true
	}
}

func SanitizedEnvironment(extra, inherited map[string]string, managerBin string) map[string]string {
	if inherited == nil {
		inherited = inheritedEnvironment()
	}
	env := map[string]string{}
	for key, value := range inherited {
		lower := textcase.Lower(key)
		if allowedNames[lower] || strings.HasPrefix(lower, "lc_") {
			env[key] = value
		}
	}
	for key, value := range extra {
		if textcase.Upper(key) != "PATH" {
			env[key] = value
		}
	}
	env["PATH"] = strings.Join(TrustedDirectories(nil, managerBin), string(os.PathListSeparator))

	return env
}
