package dailyuse

import (
	"io"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/program/command"
)

func TestHistoryRejectsVersionBeforeAction(t *testing.T) {
	c := HistoryCommand()
	c.SetErr(io.Discard)
	called := false
	command.Action(c, func(_ *command.Invocation) error { called = true; return nil })
	_, err := command.Execute(c, []string{"--restore", "abc", ".env"})
	if err == nil || called {
		t.Fatal(err, called)
	}
}
func TestHistoryConflictIncludesArgument(t *testing.T) {
	c := HistoryCommand()
	c.SetErr(io.Discard)
	_, err := command.Execute(c, []string{"--all", "--restore", "3"})
	if err == nil || !strings.Contains(err.Error(), "--restore") {
		t.Fatal(err)
	}
}
