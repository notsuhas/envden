//go:build darwin || linux

package clack

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/creack/pty"
)

func TestPromptHelper(t *testing.T) {
	kind := os.Getenv("CLACK_HELPER_KIND")
	if kind == "" {
		return
	}
	terminal := New(os.Stdin, os.Stdout)
	initial := false
	options := PromptOptions{Message: "Name?", InitialBool: &initial, Options: []Option{{Value: "a", Label: "Alpha"}, {Value: "b", Label: "Beta"}}}
	switch kind {
	case "text":
		_, _ = terminal.Text(options)
	case "password":
		_, _ = terminal.Password(options)
	case "confirm":
		_, _ = terminal.Confirm(options)
	case "select":
		_, _ = terminal.Select(options)
	case "multiselect":
		_, _ = terminal.Multiselect(options)
	}
	os.Exit(0)
}

func TestPTYReference(t *testing.T) {
	var fixtures []struct {
		Kind, Keys, Raw string
		Columns         int
		Color           bool
	}
	data, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		cmd := exec.Command(os.Args[0], "-test.run=^TestPromptHelper$") //nolint:gosec // G702: reexecutes this test binary with a fixed helper test name.
		cmd.Env = []string{"TERM=xterm-256color", "CLACK_HELPER_KIND=" + f.Kind, "FORCE_COLOR=0"}
		if f.Color {
			cmd.Env[len(cmd.Env)-1] = "FORCE_COLOR=1"
		}
		terminal, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(f.Columns & 65535), Rows: 24})
		if err != nil {
			t.Fatal(err)
		}
		var output bytes.Buffer
		sent := false
		for {
			buffer := make([]byte, 4096)
			n, readErr := terminal.Read(buffer)
			output.Write(buffer[:n])
			if !sent && (strings.Contains(output.String(), "└\r\n") || strings.Contains(output.String(), "└\x1b[39m\r\n")) {
				sent = true
				if _, err = terminal.Write([]byte(f.Keys)); err != nil {
					t.Fatal(err)
				}
			}
			if readErr != nil {
				break
			}
		}
		_ = terminal.Close()
		if err = cmd.Wait(); err != nil {
			t.Fatal(err)
		}
		if output.String() != f.Raw {
			t.Errorf("%s cols %d color %v keys %q\ngot %q\nwant %q", f.Kind, f.Columns, f.Color, f.Keys, output.String(), f.Raw)
		}
	}
}

func ExampleTerminal_Text() {
	var out bytes.Buffer
	terminal := New(strings.NewReader("hello\r"), &out)
	value, err := terminal.Text(PromptOptions{Message: "Name?"})
	fmt.Println(value, err)
	// Output: hello <nil>
}
