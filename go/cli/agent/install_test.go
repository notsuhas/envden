package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestInstallAgent(t *testing.T) {
	home := t.TempDir()
	now := func() int64 { return 0 }
	if e := InstallAgent(home, now); e != nil {
		t.Fatal(e)
	}

	path := filepath.Join(home, ".agents", "skills", "envden", "SKILL.md")
	raw, e := os.ReadFile(path)
	if e != nil || !strings.Contains(string(raw), "Never read or print env values.") {
		t.Fatal(string(raw), e)
	}

	if e = InstallAgent(home, now); e != nil {
		t.Fatal(e)
	}

	if e = os.WriteFile(path, []byte("---\nname: other\n---\n"), 0600); e != nil {
		t.Fatal(e)
	}

	if e = InstallAgent(home, now); !errors.Is(e, errors.Conflict) {
		t.Fatal(e)
	}
}
