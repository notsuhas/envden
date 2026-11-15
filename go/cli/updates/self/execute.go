package self

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/notsuhas/envden/go/cli/updates/check"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
)

func pinnedInstall(manager, binary string) (string, string) {
	path := strings.ReplaceAll(binary, "\\", "/")
	switch manager {
	case "brew":
		prefix := ""
		if m := regexp.MustCompile(`^(/.*)/Cellar/envden/`).FindStringSubmatch(path); len(m) > 0 {
			prefix = m[1]
		}
		if prefix == "" {
			for _, p := range []string{"/opt/homebrew", "/usr/local"} {
				if path == p+"/bin/envden" || path == p+"/opt/envden/bin/envden" {
					prefix = p
				}
			}
		}
		if prefix != "" {
			return prefix + "/bin/brew", prefix + "/bin/envden"
		}
	case "npm":

		for _, pattern := range []string{`^(/.*)/lib/node_modules/envden/`, `^(/.*)/bin/envden$`} {
			if m := regexp.MustCompile(pattern).FindStringSubmatch(path); len(m) > 0 {
				return m[1] + "/bin/npm", m[1] + "/bin/envden"
			}
		}

		if m := regexp.MustCompile(`^([A-Za-z]:/.*/npm)/(?:node_modules/envden/.*|envden(?:\.exe)?)$`).FindStringSubmatch(path); len(m) > 0 {
			return m[1] + "/npm.cmd", binary
		}

	case "scoop":
		if m := regexp.MustCompile(`(?i)^([a-z]:/.*/scoop)/apps/envden/`).FindStringSubmatch(path); len(m) > 0 {
			return m[1] + "/shims/scoop.cmd", m[1] + "/shims/envden.exe"
		}
	case "winget":
		if m := regexp.MustCompile(`(?i)^([a-z]:/.*/AppData/Local)/Microsoft/WinGet/(?:Packages|Links)/`).FindStringSubmatch(path); len(m) > 0 {
			return m[1] + "/Microsoft/WindowsApps/winget.exe", m[1] + "/Microsoft/WinGet/Links/envden.exe"
		}
	}

	return "", ""
}

func ManagerUpdate(command []string, binary string, o Options) (check.Result, error) {
	home := o.Env["HOME"]
	if home == "" {
		home = o.Env["USERPROFILE"]
	}

	temp := os.TempDir()
	if real, e := filepath.EvalSymlinks(temp); e == nil {
		temp = real
	}

	if process.InsideWorkingTree(home) || process.InsideWorkingTree(temp) {
		_, _ = fmt.Fprintln(o.Stderr, "envden: HOME or temp directory is inside a checkout. Run manually: "+strings.Join(command, " "))

		return check.Result{Kind: "manual"}, nil
	}

	manager, stable := pinnedInstall(command[0], binary)
	installer := []string{manager}
	if command[0] == "npm" && manager != "" {
		directory := filepath.Dir(manager)
		node := filepath.Join(directory, "node")
		if regexp.MustCompile(`^[A-Za-z]:`).MatchString(manager) {
			node += ".exe"
		}

		cli := filepath.Clean(filepath.Join(directory, "../lib/node_modules/npm/bin/npm-cli.js"))
		if _, e := os.Stat(node); e != nil {
			manager = ""
		}

		if _, e := os.Stat(cli); e != nil {
			manager = ""
		}

		installer = []string{node, cli}
	}

	if manager == "" {
		_, _ = fmt.Fprintln(o.Stderr, "envden: Cannot pin installer path. Run manually: "+strings.Join(command, " "))

		return check.Result{Kind: "manual"}, nil
	}

	absolute := append(installer, command[1:]...)
	yes, e := o.Confirm(strings.Join(absolute, " "))
	if e != nil {
		return check.Result{}, e
	}

	if !yes {
		return check.Result{Kind: "cancelled"}, nil
	}

	config, e := os.MkdirTemp(temp, "envden-manager-")
	if e != nil {
		return check.Result{}, e
	}

	defer func() { _ = os.RemoveAll(config) }() // Best-effort cleanup must not replace the operation result.
	if command[0] == "npm" {
		file := filepath.Join(config, "npmrc")
		if e = os.WriteFile(file, nil, 0600); e != nil {
			return check.Result{}, e
		}

		absolute = append(absolute, "--userconfig", file)
	}

	run := o.Run
	if run == nil {
		run = func(c []string) error {
			result, e := process.ExecTrusted(c[0], c[1:], process.Options{Env: process.SanitizedEnvironment(postInstallEnvironment(o.Env), o.Env, filepath.Dir(manager)), ManagerBin: filepath.Dir(manager), Stdin: "inherit", Stdout: "inherit", Stderr: "inherit"})
			if result.ExitCode != 0 {
				return errors.New(errors.InvalidInput, "Update command failed")
			}

			return e
		}
	}

	if e = run(absolute); e != nil {
		return check.Result{}, e
	}

	if e = run([]string{stable, "update", "--post-install"}); e != nil {
		return check.Result{}, e
	}

	return check.Result{Kind: "updated"}, nil
}

func postInstallEnvironment(env map[string]string) map[string]string {
	extra := map[string]string{}
	for _, key := range []string{"ENVDEN_HOME", "ENVDEN_NO_UPDATE_CHECK", "ENVDEN_TELEMETRY", "DO_NOT_TRACK"} {
		if v, ok := env[key]; ok {
			extra[key] = v
		}
	}

	return extra
}
