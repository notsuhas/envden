package clack

import (
	"os"

	"github.com/notsuhas/envden/go/lib/clack/internal/blockinput"
	"github.com/notsuhas/envden/go/lib/clack/internal/raw"
	"golang.org/x/term"
)

type inputBlock struct{ stop, restore func() }

func (t *Terminal) block(cancel func()) *inputBlock {
	unblocked := &inputBlock{stop: func() {}, restore: func() { t.write("\x1b[?25h") }}
	input, ok := t.Input.(*os.File)
	if !ok || !term.IsTerminal(int(input.Fd())) {
		t.write("\x1b[?25l")
		return unblocked
	}
	state, err := raw.Make(int(input.Fd()))
	if err != nil {
		t.write("\x1b[?25l")
		return unblocked
	}
	t.write("\x1b[?25l")

	echo := false
	if output, ok := t.Output.(*os.File); ok {
		echo = term.IsTerminal(int(output.Fd()))
	}
	var pending []byte
	var line blockedLine
	stop, err := blockinput.Start(input, func(data []byte) bool {
		pending = append(pending, data...)
		moved := false
		for len(pending) > 0 {
			key, n := blockedKey(pending)
			if data == nil && len(pending) == 1 && pending[0] == 27 {
				key = "\x1b"
				n = 1
			}
			if n == 0 {
				break
			}
			pending = pending[n:]
			if key == "\x03" || key == "\x1b" {
				t.write("\x1b[?25h")
				go func() { cancel(); _ = term.Restore(int(input.Fd()), state); os.Exit(0) }()
				return true
			}
			if echo {
				t.write(line.echo(key))
			}
			if !moved {
				if key == "\r" {
					t.write("\x1b[1A")
				} else {
					t.write("\x1b[1D")
				}
				moved = true
			}
		}
		// Clack rearms its one-shot keypress listener after the asynchronous erase callback.
		if moved {
			t.write("\x1b[0K")
		}
		return false
	}, func() bool { return len(pending) > 0 && pending[0] == 27 })
	if err != nil {
		_ = term.Restore(int(input.Fd()), state)
		return unblocked
	}
	return &inputBlock{stop: stop, restore: func() { t.write("\x1b[?25h"); _ = term.Restore(int(input.Fd()), state) }}
}
