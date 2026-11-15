package fixtures

import "testing"

func WithDirectory(t *testing.T, run func(string)) { t.Helper(); run(t.TempDir()) }
