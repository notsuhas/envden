package output

import (
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/core/errors"
	"testing"
)

func TestOutput(t *testing.T) {
	unsafe := "repo\x1b\x07\n\r\u009b\u202e\u2066\u061c/name"
	if got := SanitizeTerminal(unsafe); got != "repo/name" {
		t.Fatal(got)
	}
	got, e := TerminalJSON(jsonvalue.Object{{Key: "path", Value: unsafe}})
	if e != nil || got != `{"path":"repo/name"}` {
		t.Fatal(got, e)
	}
	for _, row := range []struct {
		code errors.Code
		want int
	}{{errors.InvalidInput, 2}, {errors.NotImplemented, 2}, {errors.Conflict, 3}, {errors.Unauthorized, 1}, {errors.StorageQuota, 1}, {errors.Internal, 1}} {
		if ErrorExitCode(row.code) != row.want {
			t.Fatal(row)
		}
	}
	if SanitizeConsole("a\n\tb\x1b") != "a\n\tb" {
		t.Fatal("console whitespace")
	}
}
