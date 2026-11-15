package host

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPortDecisions(t *testing.T) {
	for _, row := range []struct {
		free, ours bool
		want       int
	}{{true, false, 4783}, {false, true, 4783}, {false, false, 1234}} {
		p, e := ChooseServerPort(PortProbe{Free: func(int) (bool, error) { return row.free, nil }, Envden: func(int) (bool, error) { return row.ours, nil }, AnyFree: func() (int, error) { return 1234, nil }}, 4783)
		if e != nil || p != row.want {
			t.Fatal(p, e)
		}
	}
	for _, definition := range []string{`--port 1234`, `--port</string><string>1234`, `--port" "1234`} {
		p := InstalledPort(definition)
		if p == nil || *p != 1234 {
			t.Fatal(p)
		}
	}
}
func TestDefinitions(t *testing.T) {
	for _, platform := range []string{"darwin", "linux", "win32"} {
		d, e := ServiceDefinition(platform, "/path/with space/envden", "/data&home", "/logs/output", 4783)
		if e != nil || !strings.Contains(d.Content, "4783") {
			t.Fatal(d, e)
		}
	}
	_, e := ServiceDefinition("linux", "/unsafe\npath", "/data", "/log", 4783)
	if e == nil {
		t.Fatal("unsafe unit path")
	}
}

func TestWriteThroughDanglingLink(t *testing.T) {
	root := t.TempDir()
	link := filepath.Join(root, "link")
	target := filepath.Join(root, "new", "target")
	if e := os.Symlink("new/target", link); e != nil {
		t.Fatal(e)
	}
	if e := WriteThrough(link, []byte("bytes"), func() int64 { return 0 }); e != nil {
		t.Fatal(e)
	}
	info, e := os.Lstat(link)
	if e != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatal(info, e)
	}
	raw, e := os.ReadFile(target)
	if e != nil || string(raw) != "bytes" {
		t.Fatal(string(raw), e)
	}
}
