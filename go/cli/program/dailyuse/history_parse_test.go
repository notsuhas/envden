package dailyuse

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"io"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestHistoryRestoreParseError(t *testing.T) {
	for _, args := range [][]string{{"--restore", "abc", ".env"}, {"--restore=abc", ".env"}, {"--restore=", ".env"}} {
		c := HistoryCommand()
		c.SetErr(io.Discard)

		_, err := command.Execute(c, args)
		if !errors.Is(err, errors.InvalidInput) || err.Error() != "Version must be a number such as 3 or v3" {
			t.Fatal(err)
		}
	}
}
