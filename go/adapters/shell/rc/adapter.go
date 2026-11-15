package rc

import (
	"embed"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
)

//go:embed snippets/*.txt
var snippets embed.FS

const start = "# >>> envden >>>"

const end = "# <<< envden <<<"

type Options struct {
	Home, EnvdenHome, BackupDirectory string
	ResolveProfile                    func() string
}

type adapter struct {
	shell   string
	options Options
	profile string
}

func CreateRCShellAdapter(shell string, options ...Options) adapters.Shell {
	var o Options
	if len(options) > 0 {
		o = options[0]
	}
	if o.Home == "" {
		o.Home, _ = os.UserHomeDir()
	}
	if o.EnvdenHome == "" {
		o.EnvdenHome = os.Getenv("ENVDEN_HOME")
		if o.EnvdenHome == "" {
			o.EnvdenHome = filepath.Join(o.Home, ".envden")
		}
	}
	if o.ResolveProfile == nil {
		home, _ := os.UserHomeDir()
		if o.Home == home {
			o.ResolveProfile = func() string { return powerShellProfile(process.ExecTrustedSync, o.Home, runtime.GOOS) }
		}
	}

	return &adapter{shell: shell, options: o}
}

func (a *adapter) ID() string { return a.shell }

func (a *adapter) RCPath() string {
	switch a.shell {
	case "zsh":
		return filepath.Join(a.options.Home, ".zshrc")
	case "bash":
		return bashRCPath(a.options.Home, runtime.GOOS)
	case "fish":
		return filepath.Join(a.options.Home, ".config", "fish", "config.fish")
	default:
		if a.profile == "" {
			if a.options.ResolveProfile != nil {
				a.profile = a.options.ResolveProfile()
			}
			if a.profile == "" {
				folder := ".config"
				shellFolder := "powershell"
				if runtime.GOOS == "windows" {
					folder = "Documents"
					shellFolder = "PowerShell"
				}
				a.profile = filepath.Join(a.options.Home, folder, shellFolder, "Microsoft.PowerShell_profile.ps1")
			}
		}

		return a.profile
	}
}

func quote(s, shell string) string {
	switch shell {
	case "fish":
		s = strings.ReplaceAll(s, `\`, `\\`)
		s = strings.ReplaceAll(s, "'", `\'`)
	case "powershell":
		for _, q := range []string{"'", "’", "‘", "‚", "‛"} {
			s = strings.ReplaceAll(s, q, q+q)
		}
	default:
		s = strings.ReplaceAll(s, "'", `'\''`)
	}

	return "'" + s + "'"
}

func (a *adapter) HookSnippet(binary string) string {
	if !filepath.IsAbs(binary) || strings.ContainsAny(binary+a.options.EnvdenHome, "\r\n") {
		panic(errors.New(errors.InvalidInput, "Hook paths must be absolute and single-line"))
	}
	b, _ := snippets.ReadFile("snippets/" + a.shell + ".txt")
	s := string(b)
	s = strings.ReplaceAll(s, "'/__ENVDEN_BINARY__'", quote(binary, a.shell))
	for _, name := range []string{"notice", "approved-checkouts", "track-offered", "track-offers", "notice-update", "update-offered-day", "approved-checkouts-insensitive"} {
		s = strings.ReplaceAll(s, "'/__ENVDEN_HOME__/state/"+name+"'", quote(filepath.Join(a.options.EnvdenHome, "state", name), a.shell))
	}

	return s
}

func strip(s string) string {
	offset := 0
	for {
		idx := strings.Index(s[offset:], start)
		if idx < 0 {
			return s
		}
		idx += offset
		n := idx + len(start)
		if strings.HasPrefix(s[n:], "\r\n") {
			n += 2
		} else if strings.HasPrefix(s[n:], "\n") {
			n++
		} else {
			offset = n
			continue
		}
		finish := strings.Index(s[n:], end)
		if finish < 0 {
			return s
		}
		finish += n
		next := strings.Index(s[n:finish], start)
		if next >= 0 {
			offset = n + next
			continue
		}
		finish += len(end)
		if strings.HasPrefix(s[finish:], "\r\n") {
			finish += 2
		} else if strings.HasPrefix(s[finish:], "\n") {
			finish++
		}
		s = s[:idx] + s[finish:]
		offset = idx
	}
}

func shellFailure(err error) error {
	if err == nil {
		return nil
	}
	if _, ok := errors.As(err); ok {
		return err
	}

	return errors.Wrap(errors.Internal, "Shell configuration operation failed", err)
}

func (a *adapter) Installed() (installed bool, err error) {
	defer recoverShellError(&err)
	b, err := os.ReadFile(a.RCPath())
	if os.IsNotExist(err) {
		return false, nil
	}

	return strip(string(b)) != string(b), shellFailure(err)
}

func (a *adapter) Install(binary string) (err error) {
	defer recoverShellError(&err)
	if !filepath.IsAbs(binary) || strings.ContainsAny(binary+a.options.EnvdenHome, "\r\n") {
		return errors.New(errors.InvalidInput, "Hook paths must be absolute and single-line")
	}

	return shellFailure(editRC(a.RCPath(), func(s string) string {
		nl := "\n"
		if strings.Contains(s, "\r\n") {
			nl = "\r\n"
		}
		current := strip(s)
		if current != "" && !strings.HasSuffix(current, "\n") {
			current += nl
		}

		return current + strings.ReplaceAll(a.HookSnippet(binary), "\n", nl)
	}, a.options.BackupDirectory))
}

func (a *adapter) Uninstall() (err error) {
	defer recoverShellError(&err)

	return shellFailure(editRC(a.RCPath(), strip, a.options.BackupDirectory))
}

func recoverShellError(err *error) {
	if caught := recover(); caught != nil {
		if e, ok := caught.(error); ok {
			*err = shellFailure(e)
		} else {
			panic(caught)
		}
	}
}
