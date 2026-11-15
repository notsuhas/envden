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
		terminal.Text(options)
	case "password":
		terminal.Password(options)
	case "confirm":
		terminal.Confirm(options)
	case "select":
		terminal.Select(options)
	case "multiselect":
		terminal.Multiselect(options)
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
		cmd := exec.Command(os.Args[0], "-test.run=^TestPromptHelper$")
		cmd.Env = []string{"TERM=xterm-256color", "CLACK_HELPER_KIND=" + f.Kind, "FORCE_COLOR=0"}
		if f.Color {
			cmd.Env[len(cmd.Env)-1] = "FORCE_COLOR=1"
		}
		terminal, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(f.Columns), Rows: 24})
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
		terminal.Close()
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
