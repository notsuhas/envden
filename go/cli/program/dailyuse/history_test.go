package dailyuse

import (
	"io"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/lib/commander"
)

func TestHistoryRejectsVersionBeforeAction(t *testing.T) {
	c := HistoryCommand()
	c.Stderr = io.Discard
	called := false
	c.Action(func(_ *commander.Invocation) error { called = true; return nil })
	_, err := c.Parse([]string{"--restore", "abc", ".env"})
	if err == nil || called {
		t.Fatal(err, called)
	}
}
func TestHistoryConflictIncludesArgument(t *testing.T) {
	c := HistoryCommand()
	c.Stderr = io.Discard
	_, err := c.Parse([]string{"--all", "--restore", "3"})
	if err == nil || !strings.Contains(err.Error(), "--restore <version>") {
		t.Fatal(err)
	}
}
