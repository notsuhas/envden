package program

import (
	"bytes"
	"encoding/json"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
	"os"
	"testing"
)

func TestTSHelpParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/help.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Args           []string
		Stdout, Stderr string
		Code           int
	}
	if err = json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(string(mustJSON(c.Args)), func(t *testing.T) {
			p := CreateProgram()
			var stdout, stderr bytes.Buffer
			p.Stdout = &stdout
			p.Stderr = &stderr
			_, err := p.Parse(c.Args)
			code := 0
			if err != nil {
				exit, ok := err.(*commander.ExitError)
				if !ok {
					t.Fatal(err)
				}
				code = exit.ExitCode
			}
			if stdout.String() != c.Stdout || stderr.String() != c.Stderr || code != c.Code {
				t.Fatalf("stdout\ngot %q\nwant %q\nstderr %q code %d", stdout.String(), c.Stdout, stderr.String(), code)
			}
		})
	}
}
func TestStub(t *testing.T) {
	p := CreateProgram()
	_, err := p.Parse([]string{"push"})
	if !errors.Is(err, errors.NotImplemented) || err.Error() != "not implemented" {
		t.Fatal(err)
	}
}
func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }
