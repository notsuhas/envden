package process

import (
	"os"
	"strings"
)

var allowedNames = map[string]bool{}

func init() {
	for _, key := range strings.Fields("HOME XDG_CONFIG_HOME USER LOGNAME LANG TERM TMPDIR TMP TEMP SYSTEMROOT SYSTEMDRIVE WINDIR COMSPEC PATHEXT USERPROFILE APPDATA LOCALAPPDATA PROGRAMDATA PROGRAMFILES PROGRAMFILES(X86) HOMEDRIVE HOMEPATH") {
		allowedNames[strings.ToLower(key)] = true
	}
}
func SanitizedEnvironment(extra, inherited map[string]string, managerBin string) map[string]string {
	if inherited == nil {
		inherited = inheritedEnvironment()
	}
	env := map[string]string{}
	for key, value := range inherited {
		lower := strings.ToLower(key)
		if allowedNames[lower] || strings.HasPrefix(lower, "lc_") {
			env[key] = value
		}
	}
	for key, value := range extra {
		if strings.ToUpper(key) != "PATH" {
			env[key] = value
		}
	}
	env["PATH"] = strings.Join(TrustedDirectories(nil, managerBin), string(os.PathListSeparator))
	return env
}
