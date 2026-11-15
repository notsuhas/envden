package placement

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

func TestFake(t *testing.T) {
	fake := CreateFakePlacementAdapter(Operations{Supported: func(string) (bool, error) { return true, nil }})
	if fake.Mode() != adapters.PlacementCopy {
		t.Fatal(fake.Mode())
	}
	supported, err := fake.Supported("unused")
	if err != nil || !supported {
		t.Fatal(supported, err)
	}
	defer func() {
		if got := recover(); got != "Unexpected fake operation: placement.place" {
			t.Fatal(got)
		}
	}()
	_ = fake.Place("unused", "unused", nil, nil)
}
