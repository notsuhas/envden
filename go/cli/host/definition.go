package host

import (
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
)

func xml(value string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", "\"", "&quot;", ">", "&gt;").Replace(value)
}

func unitPath(value string) (string, error) {
	if strings.ContainsAny(value, "\r\n\x00") {
		return "", errors.New(errors.InvalidInput, "Invalid service path")
	}

	return strings.ReplaceAll(value, "%", "%%"), nil
}

func unit(value string) (string, error) {
	value, err := unitPath(value)
	if err != nil {
		return "", err
	}

	return "\"" + strings.NewReplacer("\\", "\\\\", "\"", "\\\"").Replace(value) + "\"", nil
}

type Definition struct{ Kind, Content string }

func ServiceDefinition(platform, executable, home, log string, port int) (Definition, error) {
	args := []string{executable, "serve", "--data-dir", home, "--port", strconv.Itoa(port)}
	switch platform {
	case "darwin":
		var list strings.Builder
		for _, arg := range args {
			list.WriteString("<string>" + xml(arg) + "</string>")
		}
		return Definition{"launchd", `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>com.envden.server</string><key>ProgramArguments</key><array>` + list.String() + `</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>` + xml(log) + `</string><key>StandardErrorPath</key><string>` + xml(log) + `</string></dict></plist>`}, nil
	case "linux":
		for i, arg := range args {
			v, err := unit(arg)
			if err != nil {
				return Definition{}, err
			}

			args[i] = v
		}
		path, err := unitPath(log)
		if err != nil {
			return Definition{}, err
		}
		return Definition{"systemd", "[Unit]\nDescription=envden server\n[Service]\nExecStart=" + strings.Join(args, " ") + "\nRestart=on-failure\nStandardOutput=append:" + path + "\nStandardError=append:" + path + "\n[Install]\nWantedBy=default.target\n"}, nil
	case "win32", "windows":
		quote := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
		script := "& " + quote(executable) + " serve --data-dir " + quote(home) + " --port " + strconv.Itoa(port) + " *> " + quote(log)
		settings := `<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>`
		return Definition{"task", `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers><Settings>` + settings + `</Settings><Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>-NoProfile -NonInteractive -Command ` + xml(script) + `</Arguments></Exec></Actions></Task>`}, nil
	}

	return Definition{}, errors.New(errors.NotImplemented, "Login services are unsupported on this platform")
}
