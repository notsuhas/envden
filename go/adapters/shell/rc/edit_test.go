package rc

import (
	"bytes"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	errors "github.com/notsuhas/envden/go/core/errors"
)

func must(t *testing.T, e error) {
	t.Helper()
	if e != nil {
		t.Fatal(e)
	}
}

func read(t *testing.T, p string) []byte { t.Helper(); b, e := os.ReadFile(p); must(t, e); return b }

func TestSymlinksAndBackups(t *testing.T) {
	for _, shell := range []string{"zsh", "bash", "fish", "powershell"} {
		for _, op := range []string{"install", "uninstall"} {
			t.Run(shell+op, func(t *testing.T) {
				home := t.TempDir()
				target := filepath.Join(home, "dotfile")
				backup := filepath.Join(home, "conflicts")
				a := CreateRCShellAdapter(shell, Options{Home: home, BackupDirectory: backup})
				original := "# user\n"
				if op == "uninstall" {
					original += a.HookSnippet("/opt/envden")
				}
				must(t, os.WriteFile(target, []byte(original), 0640))
				must(t, os.MkdirAll(filepath.Dir(a.RCPath()), 0700))
				must(t, os.Symlink(target, a.RCPath()))
				if op == "install" {
					must(t, a.Install("/opt/envden"))
				} else {
					must(t, a.Uninstall())
				}
				s, e := os.Lstat(a.RCPath())
				must(t, e)
				if s.Mode()&os.ModeSymlink == 0 {
					t.Fatal("link replaced")
				}
				names, e := os.ReadDir(backup)
				must(t, e)
				if len(names) != 1 || !regexp.MustCompile(`^\.envden-backup-[0-9a-f-]{36}$`).MatchString(names[0].Name()) {
					t.Fatal(names)
				}
				if string(read(t, filepath.Join(backup, names[0].Name()))) != original {
					t.Fatal("backup differs")
				}
				s, e = os.Stat(filepath.Join(backup, names[0].Name()))
				must(t, e)
				if s.Mode().Perm() != 0600 {
					t.Fatal(s.Mode())
				}
				s, e = os.Stat(backup)
				must(t, e)
				if s.Mode().Perm() != 0700 {
					t.Fatal(s.Mode())
				}
			})
		}
	}
}

func TestDanglingAndFolderLinks(t *testing.T) {
	for _, shell := range []string{"fish", "zsh"} {
		t.Run(shell, func(t *testing.T) {
			home := t.TempDir()
			a := CreateRCShellAdapter(shell, Options{Home: home})
			dotfiles := filepath.Join(home, "dotfiles")
			must(t, os.Mkdir(dotfiles, 0700))
			must(t, os.MkdirAll(filepath.Dir(a.RCPath()), 0700))
			linked := a.RCPath()
			target := filepath.Join(dotfiles, filepath.Base(a.RCPath()))
			if shell == "fish" {
				linked = filepath.Dir(linked)
				must(t, os.RemoveAll(linked))
				must(t, os.Symlink(dotfiles, linked))
			} else {
				must(t, os.Symlink(target, linked))
			}
			must(t, a.Install("/opt/envden"))
			must(t, a.Uninstall())
			if len(read(t, target)) != 0 {
				t.Fatal("target not empty")
			}
			s, e := os.Lstat(linked)
			must(t, e)
			if s.Mode()&os.ModeSymlink == 0 {
				t.Fatal("link replaced")
			}
		})
	}
}

func TestBytesModeCRLFAndOrphan(t *testing.T) {
	home := t.TempDir()
	a := CreateRCShellAdapter("bash", Options{Home: home})
	original := []byte{35, 32, 255, 13, 10}
	must(t, os.WriteFile(a.RCPath(), original, 0640))
	for range 2 {
		must(t, a.Install("/opt/envden"))
	}
	b := read(t, a.RCPath())
	if !bytes.HasPrefix(b, original) || bytes.Count(b, []byte(start)) != 1 || strings.Contains(strings.ReplaceAll(string(b), "\r\n", ""), "\n") {
		t.Fatal("bytes changed")
	}
	s, e := os.Stat(a.RCPath())
	must(t, e)
	if s.Mode().Perm() != 0640 {
		t.Fatal(s.Mode())
	}
	must(t, a.Uninstall())
	if !bytes.Equal(read(t, a.RCPath()), original) {
		t.Fatal("original differs")
	}
	orphan := start + "\n# user line\n"
	must(t, os.WriteFile(a.RCPath(), []byte(orphan), 0600))
	ok, e := a.Installed()
	must(t, e)
	if ok {
		t.Fatal("orphan installed")
	}
	must(t, a.Install("/opt/envden"))
	must(t, a.Uninstall())
	if string(read(t, a.RCPath())) != orphan {
		t.Fatal("orphan lost")
	}
}

func TestUnsafeFilesAndReadOnly(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, "rc")
	original := filepath.Join(home, "original")
	must(t, os.WriteFile(original, []byte("private"), 0600))
	must(t, os.Link(original, path))
	if editRC(path, func(string) string { return "replacement" }, "") == nil {
		t.Fatal("hardlink accepted")
	}
	if editRC(home, func(string) string { return "replacement" }, "") == nil {
		t.Fatal("directory accepted")
	}
	must(t, os.Remove(path))
	must(t, os.WriteFile(path, []byte("user"), 0444))
	must(t, editRC(path, func(s string) string { return s + " edited" }, ""))
	s, e := os.Stat(path)
	must(t, e)
	if s.Mode().Perm() != 0444 {
		t.Fatal(s.Mode())
	}
}

func TestConcurrentChanges(t *testing.T) {
	for _, step := range []string{"resolved", "opened", "read"} {
		t.Run(step, func(t *testing.T) {
			home := t.TempDir()
			path := filepath.Join(home, "rc")
			target := filepath.Join(home, "checkout")
			private := filepath.Join(home, "private")
			must(t, os.WriteFile(target, []byte("# user\n"), 0600))
			must(t, os.WriteFile(private, []byte("PRIVATE BYTES"), 0600))
			must(t, os.Symlink(target, path))
			swap := func() error {
				if e := os.Rename(target, target+".original"); e != nil {
					return e
				}
				return os.Symlink(private, target)
			}
			h := editHooks{}
			switch step {
			case "resolved":
				h.Resolved = swap
			case "opened":
				h.Opened = swap
			case "read":
				h.Read = swap
			}
			seen := ""
			e := editRC(path, func(s string) string { seen = s; return s + "edited" }, "", h)
			if e == nil || strings.Contains(seen, "PRIVATE BYTES") || string(read(t, private)) != "PRIVATE BYTES" {
				t.Fatal(seen, e)
			}
		})
	}
	home := t.TempDir()
	path := filepath.Join(home, "rc")
	must(t, os.WriteFile(path, []byte("original"), 0600))
	e := editRC(path, func(string) string { return "replacement" }, "", editHooks{Read: func() error { return os.WriteFile(path, []byte("original appended"), 0600) }})
	if !errors.Is(e, errors.Conflict) || string(read(t, path)) != "original appended" {
		t.Fatal(e)
	}
}
