//go:build darwin || linux

package clack

import (
	"io"
	"reflect"
	"testing"

	"github.com/creack/pty"
	"github.com/notsuhas/envden/go/lib/clack/internal/raw"
	"golang.org/x/term"
)

func TestSpinnerRawMode(t *testing.T) {
	master, input, err := pty.Open()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = master.Close() }()
	defer func() { _ = input.Close() }()
	fd := int(input.Fd())
	original, err := raw.Make(fd)
	if err != nil {
		t.Fatal(err)
	}
	want, err := term.GetState(fd)
	if err != nil {
		t.Fatal(err)
	}
	if err = term.Restore(fd, original); err != nil {
		t.Fatal(err)
	}
	s := New(input, io.Discard).Spinner()
	s.Manual = true
	s.Start("Working")
	active, err := term.GetState(fd)
	if err != nil {
		t.Fatal(err)
	}
	s.Stop("Done")
	restored, err := term.GetState(fd)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(active, want) {
		t.Error("spinner did not put input in raw mode")
	}
	if !reflect.DeepEqual(restored, original) {
		t.Error("spinner did not restore input mode")
	}
}

type unreadSpinnerInput struct{}

func (unreadSpinnerInput) Read([]byte) (int, error) { panic("non-TTY input must not be consumed") }

func TestSpinnerNonTTY(t *testing.T) {
	s := New(unreadSpinnerInput{}, io.Discard).Spinner()
	s.Manual = true
	s.Start("Working")
	s.Stop("Done")
	s.Start("Again")
	s.Clear()
}
