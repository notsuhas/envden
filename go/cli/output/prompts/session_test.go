//go:build !windows

package prompts

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/creack/pty"
)

const helperShellTitle = "Shell choice? It prints a line when you cd into a checkout whose env files need a push or pull"

func TestPromptPTYHelper(t *testing.T) {
	mode := os.Getenv("ENVDEN_PROMPT_HELPER")
	if mode == "" {
		return
	}
	terminal := New(os.Stdin, os.Stdout)
	if mode == "cancel" {
		_, err := terminal.Text(PromptOptions{Message: "Cancel this prompt"})
		fmt.Printf("RESULT:%t\n", IsCancel(err))
		return
	}
	if mode == "spinner" {
		indicator := terminal.Spinner()
		indicator.Start("Busy scanning")
		control := os.NewFile(3, "control")
		defer func() { _ = control.Close() }()
		_, _ = io.ReadFull(control, make([]byte, 1))
		indicator.Stop("Scan finished")
	}
	value, err := terminal.Text(PromptOptions{Message: "Device name", InitialValue: "laptop"})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("NAME:%s\n", value)
	secret, err := terminal.Password(PromptOptions{Message: "Master password", Validate: func(v string) string {
		if v == "" {
			return "Required"
		}
		return ""
	}})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("SECRET-LENGTH:%d\n", len(secret))
	initial := false
	yes, err := terminal.Confirm(PromptOptions{Message: "Add device? An always-on host is recommended.", InitialBool: &initial})
	if err != nil {
		t.Fatal(err)
	}
	no, err := terminal.Confirm(PromptOptions{Message: "Open it now?"})
	if err != nil {
		t.Fatal(err)
	}
	choice, err := terminal.Select(PromptOptions{Message: helperShellTitle, Options: []Option{{Value: "zsh", Label: "zsh"}, {Value: "bash", Label: "bash"}, {Value: "fish", Label: "fish"}, {Value: "powershell", Label: "PowerShell"}, {Value: "none", Label: "No, skip it"}}})
	if err != nil {
		t.Fatal(err)
	}
	many, err := terminal.Multiselect(PromptOptions{Message: "Checkouts", Options: []Option{{Value: "first", Label: "~/app (.env)"}, {Value: "second", Label: "second"}}, InitialValues: []string{"first", "second"}})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("RESULT:%t:%t:%s:%s\n", yes, no, choice, strings.Join(many, ","))
}

func TestPromptPTY(t *testing.T) {
	for _, mode := range []string{"normal", "spinner", "cancel-ctrl-c", "cancel-esc"} {
		t.Run(mode, func(t *testing.T) {
			helper := mode
			if strings.HasPrefix(mode, "cancel-") {
				helper = "cancel"
			}
			control, signal, err := os.Pipe()
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = control.Close() }()
			defer func() { _ = signal.Close() }()
			executable, err := os.Executable()
			if err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command(executable, "-test.run=^TestPromptPTYHelper$")
			cmd.Env = append(os.Environ(), "ENVDEN_PROMPT_HELPER="+helper, "TERM=xterm-256color")
			cmd.ExtraFiles = []*os.File{control}
			terminal, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: 200, Rows: 50})
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = terminal.Close() }()
			defer func() {
				if cmd.ProcessState == nil {
					_ = cmd.Process.Kill()
					_ = cmd.Wait()
				}
			}()
			reader := bufio.NewReader(terminal)
			var transcript strings.Builder
			expect := func(want string) {
				t.Helper()
				var received strings.Builder
				for !strings.Contains(received.String(), want) {
					b, err := reader.ReadByte()
					if err != nil {
						t.Fatalf("waiting for %q: %v\n%s", want, err, transcript.String())
					}
					received.WriteByte(b)
					transcript.WriteByte(b)
				}
			}
			send := func(keys string) {
				t.Helper()
				if _, err := io.WriteString(terminal, keys); err != nil {
					t.Fatal(err)
				}
			}
			if helper == "cancel" {
				expect("Cancel this prompt")
				if mode == "cancel-esc" {
					send("\x1b")
				} else {
					send("\x03")
				}
				expect("RESULT:true")
			} else {
				if helper == "spinner" {
					expect("Busy scanning")
					send("typed ahead\r\x1b[B")
					_, _ = signal.Write([]byte{1})
				}
				expect("Device name")
				send("\r")
				expect("Device name\r\n  laptop")
				expect("NAME:laptop")
				expect("Master password")
				send("\r")
				expect("Required")
				send("secret\r")
				expect("Master password\r\n  ••••••")
				expect("SECRET-LENGTH:6")
				expect("Add device?")
				send("y")
				expect("Add device? An always-on host is recommended.\r\n  Yes")
				expect("Open it now?")
				send("n")
				expect("Open it now?\r\n  No")
				expect("Shell choice")
				expect("No, skip it")
				send("\x1b[B\r")
				expect(helperShellTitle + "\r\n  bash")
				expect("Checkouts")
				expect("~/app (.env)")
				expect("second")
				send("\r")
				expect("Checkouts\r\n  ~/app (.env), second")
				expect("RESULT:true:false:bash:first,second")
			}
			if err := cmd.Wait(); err != nil {
				t.Fatal(err, transcript.String())
			}
		})
	}
}
