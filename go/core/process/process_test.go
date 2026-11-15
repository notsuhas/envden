package process

import (
	e "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"testing"
)

func writeTool(t *testing.T, path, text string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(text), 0755); err != nil {
		t.Fatal(err)
	}
}
func mkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0700); err != nil {
		t.Fatal(err)
	}
}
func canonicalTemp(t *testing.T) string {
	t.Helper()
	p, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestEnvironmentFiltering(t *testing.T) {
	inherited := map[string]string{"HOME": "/home/test", "XDG_CONFIG_HOME": "/home/test/.config", "LANG": "C", "LC_ALL": "C", "PATH": ".", "HOMEBREW_BASH_COMMAND": "payload", "NODE_PATH": "payload", "GIT_EXEC_PATH": "payload", "NODE_OPTIONS": "payload", "GIT_CONFIG_NOSYSTEM": "payload"}
	env := SanitizedEnvironment(map[string]string{"GIT_CONFIG_NOSYSTEM": "1", "pAtH": "attacker"}, inherited, "")
	for _, key := range []string{"HOME", "XDG_CONFIG_HOME", "LANG", "LC_ALL"} {
		if env[key] != inherited[key] {
			t.Fatal(key, env)
		}
	}
	for _, key := range []string{"HOMEBREW_BASH_COMMAND", "NODE_PATH", "GIT_EXEC_PATH", "NODE_OPTIONS", "pAtH"} {
		if _, ok := env[key]; ok {
			t.Fatal(key)
		}
	}
	if env["GIT_CONFIG_NOSYSTEM"] != "1" || env["PATH"] != strings.Join(TrustedDirectories(nil, ""), string(os.PathListSeparator)) {
		t.Fatal(env)
	}
	for key := range allowedNames {
		if SanitizedEnvironment(nil, map[string]string{strings.ToUpper(key): "yes"}, "")[strings.ToUpper(key)] != "yes" {
			t.Fatal(key)
		}
	}
}

func TestRegistryAndSymlinks(t *testing.T) {
	root := canonicalTemp(t)
	checkout, bin := filepath.Join(root, "checkout"), filepath.Join(root, "bin")
	mkdir(t, checkout)
	mkdir(t, bin)
	tool := filepath.Join(checkout, "tool")
	writeTool(t, tool, "#!/bin/sh\nexit 0")
	if err := os.Symlink(tool, filepath.Join(bin, "tool")); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(root, "alias")
	if err := os.Symlink(checkout, alias); err != nil {
		t.Fatal(err)
	}
	SetUntrustedRoots([]string{checkout})
	defer SetUntrustedRoots(nil)
	if _, err := ResolveTrustedExecutable(filepath.Join(bin, "tool")); !e.Is(err, e.InvalidInput) {
		t.Fatal(err)
	}
	if got := TrustedDirectories([]string{checkout, alias, bin}, ""); !reflect.DeepEqual(got, []string{bin}) {
		t.Fatal(got)
	}
	if !InsideWorkingTree(checkout) || InsideWorkingTree(checkout+"-other") {
		t.Fatal("root containment")
	}
	SetUntrustedRoots([]string{alias})
	if !InsideWorkingTree(checkout) {
		t.Fatal("canonical root missing")
	}
}

func TestPathIgnoredAndExecutableModes(t *testing.T) {
	root := canonicalTemp(t)
	t.Setenv("PATH", root)
	for _, name := range []string{"git", "ssh", "brew", "tailscale", "ps", "launchctl", "envden-fake-tool"} {
		writeTool(t, filepath.Join(root, name), "#!/bin/sh\necho compromised")
		resolved, err := ResolveTrustedExecutable(name)
		if err == nil && strings.HasPrefix(resolved, root) {
			t.Fatal(resolved)
		}
	}
	if slices.Contains(strings.Split(SanitizedEnvironment(nil, nil, "")["PATH"], string(os.PathListSeparator)), root) {
		t.Fatal("inherited PATH")
	}
	bin := filepath.Join(root, "bin")
	mkdir(t, bin)
	tool := filepath.Join(bin, "tool")
	writeTool(t, tool, "#!/bin/sh\nexit 0")
	if err := os.Chmod(bin, 0777); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" {
		if _, err := ResolveTrustedExecutable(tool); err == nil {
			t.Fatal("writable bin")
		}
	}
	_ = os.Chmod(bin, 0700)
	_ = os.Chmod(tool, 0666)
	if _, err := ResolveTrustedExecutable(tool); err == nil {
		t.Fatal("writable executable")
	}
	_ = os.Chmod(tool, 0755)
	writeTool(t, filepath.Join(root, ".git"), "gitdir: elsewhere")
	link := canonicalTemp(t)
	if err := os.Symlink(tool, filepath.Join(link, "tool")); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolveTrustedExecutable(filepath.Join(link, "tool")); err == nil {
		t.Fatal("checkout symlink")
	}
	for _, name := range []string{"./git", "../git", "bin/git"} {
		if _, err := ResolveTrustedExecutable(name); err == nil {
			t.Fatal(name)
		}
	}
}

func TestManagerRootsAndBin(t *testing.T) {
	root := canonicalTemp(t)
	mkdir(t, filepath.Join(root, ".git"))
	bin := filepath.Join(root, "bin")
	mkdir(t, bin)
	if !InsideWorkingTree(bin) || InsideWorkingTree(bin, []string{root}) {
		t.Fatal("manager exemption")
	}
	nested := filepath.Join(bin, "prefix")
	mkdir(t, filepath.Join(nested, ".git"))
	if !InsideWorkingTree(nested, []string{nested}) {
		t.Fatal("parent checkout")
	}
	if !reflect.DeepEqual(ManagerRoots("darwin", "arm64"), []string{"/opt/homebrew"}) || !reflect.DeepEqual(ManagerRoots("darwin", "x64"), []string{"/usr/local/Homebrew"}) || slices.Contains(ManagerRoots("linux", ""), "/opt/homebrew") {
		t.Fatal("manager roots")
	}
	manager := canonicalTemp(t)
	want := append(TrustedDirectories(nil, ""), manager)
	if got := strings.Split(SanitizedEnvironment(nil, map[string]string{}, manager)["PATH"], string(os.PathListSeparator)); !reflect.DeepEqual(got, want) {
		t.Fatal(got, want)
	}
	SetUntrustedRoots([]string{manager})
	defer SetUntrustedRoots(nil)
	if got := SanitizedEnvironment(nil, map[string]string{}, manager)["PATH"]; got != strings.Join(TrustedDirectories(nil, ""), string(os.PathListSeparator)) {
		t.Fatal(got)
	}
}

func TestOwnerModeAndFixedDirectories(t *testing.T) {
	for _, row := range []struct {
		mode, gid uint32
		platform  string
		want      bool
	}{{0775, 80, "linux", false}, {0775, 80, "darwin", true}, {0775, 0, "linux", true}, {0775, 20, "linux", false}, {0777, 80, "linux", false}, {0777, 80, "win32", true}} {
		if got := TrustedOwnerAndMode(row.mode, 0, row.gid, row.platform); got != row.want {
			t.Fatal(row)
		}
	}
	if !reflect.DeepEqual(FixedDirectories("darwin")[:4], []string{"/usr/bin", "/bin", "/usr/sbin", "/sbin"}) || slices.Contains(FixedDirectories("linux"), "/opt/homebrew/bin") {
		t.Fatal("fixed directory ordering")
	}
	if !reflect.DeepEqual(FixedDirectories("win32"), []string{`C:\Windows\System32`, `C:\Windows\System32\OpenSSH`, `C:\Windows\System32\WindowsPowerShell\v1.0`, `C:\Program Files\PowerShell\7`, `C:\Program Files\Git\cmd`, `C:\Program Files\Tailscale`}) {
		t.Fatal("windows fixed paths")
	}
}
