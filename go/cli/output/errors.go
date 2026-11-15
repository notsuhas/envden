package output

import (
	"fmt"
	"io"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
)

func ErrorExitCode(code errors.Code) int {
	switch code {
	case errors.Conflict:
		return 3
	case errors.InvalidInput, errors.NotImplemented:
		return 2
	default:
		return 1
	}
}

func ReportError(w io.Writer, err error) int {
	_, _ = fmt.Fprintln(w, SanitizeTerminal(err.Error()))
	if e, ok := errors.As(err); ok {
		return ErrorExitCode(e.Code)
	}

	return 1
}

type TerminalWriter struct {
	Writer  io.Writer
	Console bool
}

func (w TerminalWriter) Write(p []byte) (int, error) {
	raw := string(p)
	newline := strings.HasSuffix(raw, "\n")
	text := SanitizeTerminal(strings.TrimSuffix(raw, "\n"))
	if newline {
		text += "\n"
	}

	if w.Console {
		text = SanitizeConsole(string(p))
	}

	_, err := io.WriteString(w.Writer, text)

	return len(p), err
}
