//go:build darwin || linux

package clack

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/creack/pty"
)

type spinnerFixture struct {
	Keys   []string `json:"keys"`
	Cancel bool     `json:"cancel"`
	Clear  bool     `json:"clear"`
	Raw    string   `json:"raw"`
}

func TestSpinnerHelper(t *testing.T) {
	if os.Getenv("CLACK_SPINNER_HELPER") != "1" {
		return
	}
	terminal := New(os.Stdin, os.Stdout)
	s := terminal.Spinner()
	s.Manual = true
	s.Start("Working...")
	control := os.NewFile(3, "control")
	var b [1]byte
	_, _ = control.Read(b[:])
	if os.Getenv("CLACK_SPINNER_CLEAR") == "1" {
		s.Clear()
	} else {
		s.Stop("Done")
	}
	os.Exit(0)
}

func captureSpinner(t *testing.T, cmd *exec.Cmd, f spinnerFixture) string {
	t.Helper()
	control, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = control.Close() }()
	defer func() { _ = writer.Close() }()
	cmd.ExtraFiles = []*os.File{control}
	terminal, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = terminal.Close() }()
	t.Cleanup(func() {
		if cmd.ProcessState == nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	})
	var output bytes.Buffer
	readUntil := func(marker string) {
		t.Helper()
		var chunk strings.Builder
		for !strings.Contains(chunk.String(), marker) {
			b := make([]byte, 4096)
			n, e := terminal.Read(b)
			output.Write(b[:n])
			chunk.Write(b[:n])
			if e != nil || n == 0 {
				t.Fatalf("waiting for %q: %v, output %q", marker, e, output.String())
			}
		}
	}
	readUntil("│\r\n")
	for _, key := range f.Keys {
		if _, err = io.WriteString(terminal, key); err != nil {
			t.Fatal(err)
		}
		if !f.Cancel {
			readUntil("\x1b[0K")
		}
	}
	if !f.Cancel {
		_, _ = writer.Write([]byte{1})
	}
	if f.Cancel {
		readUntil("Canceled\r\n\x1b[?25h")
		_, _ = writer.Write([]byte{1})
	} else {
		readUntil("\x1b[?25h")
	}
	if err = cmd.Wait(); err != nil {
		t.Fatal(err)
	}
	return output.String()
}

func TestSpinnerPTYReference(t *testing.T) {
	var fixtures []spinnerFixture
	data, err := os.ReadFile("testdata/spinner-pty.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		cmd := exec.Command(os.Args[0], "-test.run=^TestSpinnerHelper$") //nolint:gosec // Reexecutes this test binary with a fixed helper name.
		cmd.Env = []string{"CLACK_SPINNER_HELPER=1", "TERM=xterm-256color", "FORCE_COLOR=0"}
		if f.Clear {
			cmd.Env = append(cmd.Env, "CLACK_SPINNER_CLEAR=1")
		}
		if got := captureSpinner(t, cmd, f); got != f.Raw {
			t.Errorf("keys %q clear %v\ngot  %q\nwant %q", f.Keys, f.Clear, got, f.Raw)
		}
	}
}

func TestRegenerateSpinnerPTYReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}
	script := `import {spinner} from '../../../../apps/cli/node_modules/@clack/prompts/dist/index.mjs';
import {createReadStream} from 'node:fs';
globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
const s=spinner();s.start('Working...');
createReadStream(null,{fd:3}).once('data',()=>{
 if(process.env.CLACK_SPINNER_CLEAR==='1')s.clear();else s.stop('Done');
 process.exit(0);
});`
	path := "testdata/spinner-pty.mjs"
	if err := os.WriteFile(path, []byte(script), 0600); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.Remove(path) }()
	fixtures := []spinnerFixture{
		{Keys: []string{"a", "b", "\r", "é", "😊", "\x1b[D", "\x7f", "\t"}},
		{Keys: []string{"confirm"}},
		{Keys: []string{"x"}, Clear: true},
		{Keys: []string{"\x03"}, Cancel: true},
		{Keys: []string{"\x1b"}, Cancel: true},
	}
	for i, f := range fixtures {
		cmd := exec.Command("node", path)
		cmd.Env = append(os.Environ(), "FORCE_COLOR=0", "TERM=xterm-256color")
		if f.Clear {
			cmd.Env = append(cmd.Env, "CLACK_SPINNER_CLEAR=1")
		}
		fixtures[i].Raw = captureSpinner(t, cmd, f)
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile("testdata/spinner-pty.json", append(data, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
}
