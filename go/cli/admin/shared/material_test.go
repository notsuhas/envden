package shared

import (
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestEpochKey(t *testing.T) {
	m := Material{Keys: map[int][]byte{1: {1}, 2: {2}}}
	if key, err := m.EpochKey(1); err != nil || key[0] != 1 {
		t.Fatal(key, err)
	}

	_, err := m.EpochKey(99)
	if !errors.Is(err, errors.InvalidData) || err.Error() != "Vault key for an earlier epoch is missing" {
		t.Fatal(err)
	}
}
