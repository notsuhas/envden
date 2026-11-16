package reconciliation

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func TestPlacementReconciliationMatrix(t *testing.T) {
	layouts := [][]string{{"link"}, {"copy"}, {"link", "copy"}, {"copy", "copy"}, {"link", "link"}, {"link", "copy", "copy"}}

	for _, layout := range layouts {
		for _, scenario := range []string{"unchanged", "remote edit", "store edit", "missing store", "missing target", "deleted remotely", "local edit versus deletion", "repair conflict"} {
			t.Run(strings.Join(layout, "+")+"/"+scenario, func(t *testing.T) {
				fixture := newReconciliationFixture(t, layout)
				sc := fixture.context
				server := []byte("TOKEN=A\n")
				want := string(server)
				conflict := false

				switch scenario {
				case "remote edit":
					server = []byte("TOKEN=B\n")
					want = string(server)
				case "store edit":
					want = "TOKEN=C\n"
					if err := localfiles.WriteBytes(fixture.store, []byte(want), sc.Options.Now); err != nil {
						t.Fatal(err)
					}
				case "missing store":
					if err := os.Remove(fixture.store); err != nil {
						t.Fatal(err)
					}
				case "missing target":
					if err := os.Remove(filepath.Join(fixture.targets[0].Root, ".env")); err != nil {
						t.Fatal(err)
					}
				case "deleted remotely":
					server = nil
					want = ""
				case "local edit versus deletion":
					server = nil
					want = "TOKEN=C\n"
					conflict = true
					if err := localfiles.WriteBytes(fixture.store, []byte(want), sc.Options.Now); err != nil {
						t.Fatal(err)
					}
				case "repair conflict":
					conflict = true
				}

				entry := fixture.seal(t, 2, server)
				repairs := map[string]bool{}

				if scenario == "repair conflict" {
					repairs[encoding.Base32(entry.FileId)] = true
				}

				result, err := ReconcileFile(sc, fixture.targets, fixture.store, &entry, repairs, nil)
				if err != nil {
					t.Fatal(err)
				}

				expectedConflicts := 0

				if conflict {
					expectedConflicts = 1
				}

				if result.Conflicts != expectedConflicts {
					t.Fatal(result)
				}

				stored, err := localfiles.ReadBytes(fixture.store)
				if err != nil || string(stored) != want {
					t.Fatal(string(stored), want, err)
				}

				if conflict {
					records, err := local.ConflictRecords(sc.Adapters.Home)
					if err != nil || len(records) != 1 {
						t.Fatal(records, err)
					}

					return
				}

				for _, target := range fixture.targets {
					value, err := os.ReadFile(filepath.Join(target.Root, target.Path))

					if server == nil {
						if !os.IsNotExist(err) {
							t.Fatal(err)
						}

						continue
					}
					if err != nil || string(value) != want {
						t.Fatal(string(value), want, err)
					}
				}
			})
		}
	}
}
