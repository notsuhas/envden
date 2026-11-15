package restore

import (
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestRestoreGate(t *testing.T) {
	for _, c := range []struct {
		yes, interactive, agent bool
		want, message           string
	}{
		{false, true, false, "confirm", ""}, {true, true, false, "proceed", ""}, {true, false, false, "refused", "Restore requires a terminal; use config agent-merge on before --yes"}, {false, false, true, "refused", "Non-interactive restore requires --yes"}, {true, false, true, "proceed", ""},
	} {
		got, message := RestoreGate(c.yes, c.interactive, c.agent)
		if got != c.want || message != c.message {
			t.Fatal(c, got, message)
		}
	}
}

func TestRestoreRefusal(t *testing.T) {
	for _, c := range []struct {
		managed, local, detached, conflicted bool
		code                                 errors.Code
	}{{true, false, false, false, ""}, {false, false, false, false, errors.NotFound}, {true, true, false, false, errors.InvalidInput}, {true, false, true, false, errors.Conflict}, {true, false, false, true, errors.Conflict}} {
		err := RestoreRefusal(c.managed, c.local, c.detached, c.conflicted)
		if c.code == "" {
			if err != nil {
				t.Fatal(err)
			}
		} else if !errors.Is(err, c.code) {
			t.Fatal(c, err)
		}
	}
}

func TestParseVersion(t *testing.T) {
	for _, c := range []struct {
		value string
		want  uint64
	}{{"3", 3}, {"v12", 12}, {" v4 ", 4}, {"\ufeffv3\ufeff", 3}, {"9999999999999999", 10000000000000000}} {
		got, err := ParseVersion(c.value)
		if err != nil || got != c.want {
			t.Fatal(c, got, err)
		}
	}

	for _, v := range []string{"0", "-1", "1.5", "x", "", "01", "V3", "10000000000000000", "\u00853\u0085"} {
		if _, err := ParseVersion(v); !errors.Is(err, errors.InvalidInput) {
			t.Fatal(v, err)
		}
	}
}
