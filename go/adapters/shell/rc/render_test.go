package rc

import (
	stderrors "errors"
	errors "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/process"
)

func TestSnippetBytes(t *testing.T) {
	for _, shell := range []string{"bash", "zsh", "fish", "powershell"} {
		t.Run(shell, func(t *testing.T) {
			a := CreateRCShellAdapter(shell, Options{Home: "/home/test", EnvdenHome: "/home/test/.envden"})
			want := read(t, "testdata/"+shell+".txt")
			if a.HookSnippet("/opt/envden's bin/envden") != string(want) {
				t.Fatal("snippet differs from TS renderer")
			}
			if e := a.Install("relative"); e == nil {
				t.Fatal("relative binary accepted")
			}
		})
	}
}

func TestBashProfiles(t *testing.T) {
	for _, r := range []struct{ file, text, want string }{{".profile", "# user", ".profile"}, {".bash_login", "# user", ".bash_login"}, {".bashrc", start, ".bashrc"}, {".bash_profile", "[ -f ~/.bashrc ] && . ~/.bashrc", ".bashrc"}, {".bash_profile", "if true; then . ~/.bashrc; fi", ".bashrc"}, {".bash_profile", "[[ -r ~/.bashrc ]] && source ~/.bashrc", ".bashrc"}, {".bash_profile", "# source ~/.bashrc", ".bash_profile"}} {
		home := t.TempDir()
		must(t, os.WriteFile(filepath.Join(home, r.file), []byte(r.text), 0600))
		if got := bashRCPath(home, "darwin"); got != filepath.Join(home, r.want) {
			t.Fatal(r, got)
		}
	}
}

func TestPowerShellProfiles(t *testing.T) {
	home := t.TempDir()
	redirected := filepath.Join(home, "redirected", "Microsoft.PowerShell_profile.ps1")
	calls := []string{}
	run := func(name string, args []string, o process.Options) (string, error) {
		calls = append(calls, name)
		if o.Timeout != 5000 || strings.Join(args, " ") != "-NoProfile -NonInteractive -Command $PROFILE.CurrentUserCurrentHost" {
			t.Fatal(args, o)
		}
		if name == "pwsh" {
			return "", os.ErrNotExist
		}
		return redirected + "\r\n", nil
	}
	if got := powerShellProfile(run, home, "darwin"); got != redirected {
		t.Fatal(got)
	}
	if strings.Join(calls, ",") != "pwsh,powershell" {
		t.Fatal(calls)
	}
	count := 0
	a := CreateRCShellAdapter("powershell", Options{Home: home, ResolveProfile: func() string { count++; return redirected }})
	if a.RCPath() != redirected || a.RCPath() != redirected || count != 1 {
		t.Fatal(count)
	}
	for _, p := range []string{"relative/Microsoft.PowerShell_profile.ps1", redirected + "/extra", strings.ReplaceAll(redirected, "redirected", "bad\x00path"), strings.ReplaceAll(redirected, "redirected", "bad\tpath")} {
		if got := powerShellProfile(func(string, []string, process.Options) (string, error) { return p, nil }, home, "darwin"); got != "" {
			t.Fatal(got)
		}
	}
	legacy := filepath.Join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1")
	must(t, os.MkdirAll(filepath.Dir(legacy), 0700))
	must(t, os.WriteFile(legacy, []byte(start), 0600))
	if got := powerShellProfile(func(string, []string, process.Options) (string, error) { return redirected, nil }, home, "windows"); got != legacy {
		t.Fatal(got)
	}
}

func TestHookRuntime(t *testing.T) {
	for _, shell := range []string{"bash", "zsh"} {
		t.Run(shell, func(t *testing.T) {
			if _, e := process.ResolveTrustedExecutable(shell); e != nil {
				t.Skip("shell unavailable")
			}
			home := t.TempDir()
			state := filepath.Join(home, ".envden", "state")
			must(t, os.MkdirAll(state, 0700))
			must(t, os.WriteFile(filepath.Join(state, "notice"), nil, 0600))
			must(t, os.WriteFile(filepath.Join(state, "track-offers"), []byte(home+"\n"), 0600))
			must(t, os.WriteFile(filepath.Join(state, "notice-update"), []byte("envden: update available; run envden update\nenvden: update required; run envden update\nmalicious\x1b[31m\n"), 0600))
			a := CreateRCShellAdapter(shell, Options{Home: home})
			snippet := a.HookSnippet("/bin/true")
			run := func() string {
				out, e := process.ExecTrusted(shell, []string{"-c", snippet}, process.Options{Cwd: home})
				must(t, e)
				return out.Stdout
			}
			first := run()
			if !strings.Contains(first, "run envden track") || !strings.Contains(first, "update available") || strings.Contains(first, "malicious") {
				t.Fatal(first)
			}
			if got := run(); got != "envden: update required; run envden update\n" {
				t.Fatal(got)
			}
		})
	}
}

func TestShellFailure(t *testing.T) {
	domain := errors.New(errors.Conflict, "Shell changed")
	if shellFailure(domain) != domain {
		t.Fatal("domain error replaced")
	}
	cause := stderrors.New("private shell contents")
	e := shellFailure(cause)
	wrapped, ok := errors.As(e)
	if !ok || wrapped.Code != errors.Internal || wrapped.Cause != cause || strings.Contains(e.Error(), cause.Error()) {
		t.Fatal(e)
	}
}
