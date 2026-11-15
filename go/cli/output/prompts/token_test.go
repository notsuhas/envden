package prompts

import (
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestTokenAndDeviceName(t *testing.T) {
	_, e := ReadToken("setup", nil, strings.NewReader("\n"), false)
	if !errors.Is(e, errors.InvalidInput) || e.Error() != "Provide the token on stdin or use the prompt in a terminal" {
		t.Fatal(e)
	}

	name, e := AskDeviceName(nil, "MacBook.local", false)
	if e != nil || name != "MacBook" {
		t.Fatal(name, e)
	}

	given := "picked"
	name, e = AskDeviceName(&given, "ignored", false)
	if e != nil || name != given {
		t.Fatal(name, e)
	}
}
