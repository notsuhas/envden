package output

import (
	"fmt"
	"io"
)

type Terminal struct{ Stdout, Stderr io.Writer }

func (t Terminal) Log(message string) error {
	_, err := fmt.Fprintln(t.Stdout, SanitizeConsole(message))

	return err
}

func (t Terminal) Error(message string) error {
	_, err := fmt.Fprintln(t.Stderr, SanitizeTerminal(message))

	return err
}

func WithTerminalErrors(stdout, stderr io.Writer, action func(Terminal) error) error {
	return action(Terminal{stdout, stderr})
}
