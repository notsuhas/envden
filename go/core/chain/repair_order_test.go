package chain_test

import (
	"os"
	"reflect"
	"testing"

	manifestchain "github.com/notsuhas/envden/go/core/chain/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func TestRepairOrderMatchesManifestWalk(t *testing.T) {
	raw, err := os.ReadFile("testdata/typescript.json")
	if err != nil {
		t.Fatal(err)
	}
	checked := false
	for _, row := range decode[[]vector](raw) {
		if row.Name != "acceptManifest" || row.Error != nil {
			continue
		}
		v, err := run(row)
		if err != nil {
			t.Fatal(err)
		}
		result := v.(manifestchain.Result)
		if result.Kind != "accepted" {
			continue
		}
		input := decode[acceptFixtureInput](row.Args[0])
		want := []string{}
		seen := map[string]bool{}
		for _, entry := range result.Repairs {
			id := encoding.Base32(entry.FileId)
			if input.LocalFileIds[id] && !seen[id] {
				want = append(want, id)
				seen[id] = true
			}
		}
		if !reflect.DeepEqual(result.NoFastForward, want) {
			t.Fatal(result.NoFastForward, want)
		}
		checked = checked || len(want) > 0
	}
	if !checked {
		t.Fatal("no repair case checked")
	}
}
