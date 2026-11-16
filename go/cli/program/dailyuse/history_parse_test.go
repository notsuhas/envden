package dailyuse

import (
	"io"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestHistoryRestoreParseError(t *testing.T) {
	for _, args := range [][]string{{"--restore", "abc", ".env"}, {"--restore=abc", ".env"}, {"--restore=", ".env"}} {
		c := HistoryCommand()
		c.Stderr = io.Discard

		_, err := c.Parse(args)
		if !errors.Is(err, errors.InvalidInput) || err.Error() != "Version must be a number such as 3 or v3" {
			t.Fatal(err)
		}
	}
}
