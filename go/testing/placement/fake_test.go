package placement

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	"testing"
)

func TestFake(t *testing.T) {
	fake := CreateFakePlacementAdapter(Operations{Supported: func(string) (bool, error) { return true, nil }})
	if fake.Mode() != a.PlacementCopy {
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
	fake.Place("unused", "unused", nil, nil)
}
