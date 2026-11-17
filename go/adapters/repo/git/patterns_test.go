package git

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func TestEnvFilesRefusesUnsupportedPatterns(t *testing.T) {
	f := repoFixture(t, t.TempDir())
	write(t, f.Root, ".env", "A=1\n")
	write(t, f.Root, ".gitignore", ".env\n")
	c, err := f.Repo.CheckoutAt(f.Root)
	must(t, err)
	for _, row := range []struct {
		rules   adapters.EnvFileRules
		invalid bool
	}{
		{adapters.EnvFileRules{Include: []string{"[a]"}}, true},
		{adapters.EnvFileRules{Exclude: []string{"[a]"}}, true},
		{adapters.EnvFileRules{Include: []string{"*", "[a]"}}, false},
		{adapters.EnvFileRules{Include: []string{}, Exclude: []string{"[a]"}}, false},
	} {
		_, err := f.Repo.EnvFiles(*c, &row.rules)
		if row.invalid {
			if !envdenerrors.Is(err, envdenerrors.InvalidInput) || err.Error() != "Unsupported env file pattern" {
				t.Errorf("%+v: got %v, want INVALID_INPUT", row.rules, err)
			}
		} else {
			must(t, err)
		}
	}
}
